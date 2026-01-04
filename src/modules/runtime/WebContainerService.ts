/**
 * src/modules/runtime/WebContainerService.ts
 * Browser-native Runtime Sandbox using WebContainers.
 * The Agent's "Legs" - translates AGENT_EXEC_CMD into actual shell execution.
 */

import { WebContainer, FileSystemTree } from '@webcontainer/api';
import { eventBus } from '../core/EventBus';

// ============================================================================
// WEBCONTAINER SERVICE - THE RUNTIME ENGINE
// ============================================================================

class WebContainerService {
    private instance: WebContainer | null = null;
    private isBooting = false;

    constructor() {
        console.log('[Runtime] WebContainerService initializing...');

        // Listen for execution commands from the Agent (Nervous System)
        eventBus.subscribe('AGENT_EXEC_CMD', async (envelope) => {
            console.log('[Runtime] Received AGENT_EXEC_CMD event:', envelope);
            const event = envelope.event;
            if (event.type !== 'AGENT_EXEC_CMD') return;

            console.log('[Runtime] Executing command:', event.payload.command, event.payload.args);
            await this.execute(event.payload.command, event.payload.args);
        });

        console.log('[Runtime] WebContainerService ready, listening for AGENT_EXEC_CMD');
    }

    // ========================================================================
    // LIFECYCLE
    // ========================================================================

    /**
     * Boot the WebContainer instance.
     * Must be called before executing commands.
     */
    public async boot(): Promise<void> {
        if (this.instance || this.isBooting) return;

        console.log('[Runtime] Booting WebContainer...');
        this.isBooting = true;

        try {
            this.instance = await WebContainer.boot();
            this.isBooting = false;

            // Listen for dev server ready events
            this.instance.on('server-ready', (_port, url) => {
                eventBus.emit({
                    type: 'RUNTIME_READY',
                    payload: { url }
                });
                console.log(`[Runtime] Dev server ready at: ${url}`);
            });

            eventBus.emit({
                type: 'RUNTIME_READY',
                payload: { url: '' }
            });

            console.log('[Runtime] Boot Complete.');
        } catch (error) {
            console.error('[Runtime] Boot Failed:', error);
            this.isBooting = false;
            throw error;
        }
    }

    /**
     * Tear down the WebContainer instance.
     */
    public async teardown(): Promise<void> {
        this.instance?.teardown();
        this.instance = null;
        console.log('[Runtime] Container torn down');
    }

    // ========================================================================
    // COMMAND EXECUTION
    // ========================================================================

    /**
     * Execute a shell command in the container.
     * Streams output to EventBus as RUNTIME_OUTPUT events.
     */
    public async execute(command: string, args: string[] = []): Promise<number> {
        // Ensure container is booted
        if (!this.instance) await this.boot();
        if (!this.instance) return 1; // Boot failed

        console.log(`[Runtime] Executing: ${command} ${args.join(' ')}`);

        const process = await this.instance.spawn(command, args);

        // Stream stdout to EventBus
        process.output.pipeTo(
            new WritableStream({
                write(data) {
                    eventBus.emit({
                        type: 'RUNTIME_OUTPUT',
                        payload: { stream: 'stdout', data }
                    });
                }
            })
        );

        // Wait for process to exit
        const exitCode = await process.exit;

        // Emit exit event
        eventBus.emit({
            type: 'RUNTIME_EXIT',
            payload: { exitCode }
        });

        console.log(`[Runtime] Command exited with code: ${exitCode}`);
        return exitCode;
    }

    // ========================================================================
    // FILE SYSTEM
    // ========================================================================

    /**
     * Mount a file tree to the container's virtual filesystem.
     */
    public async mountFiles(fileTree: FileSystemTree): Promise<void> {
        if (!this.instance) await this.boot();
        if (!this.instance) throw new Error('Container boot failed');

        await this.instance.mount(fileTree);
        console.log('[Runtime] Files mounted');
    }

    /**
     * Write a single file to the container.
     */
    public async writeFile(path: string, content: string): Promise<void> {
        if (!this.instance) throw new Error('Container not booted');
        await this.instance.fs.writeFile(path, content);
    }

    /**
     * Read a file from the container.
     */
    public async readFile(path: string): Promise<string> {
        if (!this.instance) throw new Error('Container not booted');
        return await this.instance.fs.readFile(path, 'utf-8');
    }

    // ========================================================================
    // STATUS
    // ========================================================================

    public isReady(): boolean {
        return this.instance !== null && !this.isBooting;
    }

    public isCurrentlyBooting(): boolean {
        return this.isBooting;
    }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const runtime = new WebContainerService();
export { WebContainerService };
