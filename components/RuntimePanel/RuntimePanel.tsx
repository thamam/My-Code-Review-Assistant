/**
 * components/RuntimePanel/RuntimePanel.tsx
 * Phase 11.3: The Visual Terminal Interface
 * Renders stdout/stderr streams from the WebContainer Runtime.
 */

import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { eventBus } from '../../src/modules/core/EventBus';
import '@xterm/xterm/css/xterm.css';

export const RuntimePanel: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const termRef = useRef<Terminal | null>(null);

    useEffect(() => {
        if (!containerRef.current || termRef.current) return;

        // 1. Initialize XTerm
        const term = new Terminal({
            theme: {
                background: '#1e1e1e',
                foreground: '#d4d4d4',
                cursor: '#d4d4d4',
                cursorAccent: '#1e1e1e',
                selectionBackground: '#3a3a3a',
            },
            cursorBlink: true,
            fontSize: 14,
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            scrollback: 1000,
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);

        term.open(containerRef.current);
        fitAddon.fit();

        term.writeln('\x1b[36m╔══════════════════════════════════════════╗\x1b[0m');
        term.writeln('\x1b[36m║\x1b[0m   \x1b[1;35mTheia Runtime Sandbox\x1b[0m [v20.19.1]     \x1b[36m║\x1b[0m');
        term.writeln('\x1b[36m╚══════════════════════════════════════════╝\x1b[0m');
        term.writeln('');
        term.writeln('\x1b[90mWaiting for agent commands...\x1b[0m');
        term.writeln('');

        termRef.current = term;

        // 2. Wire the Nervous System (EventBus)
        const unsubscribe = eventBus.subscribe('*', (envelope) => {
            const event = envelope.event;

            // Input: Agent Command (show what's being executed)
            if (event.type === 'AGENT_EXEC_CMD') {
                const { command, args } = event.payload;
                term.writeln(`\x1b[32m$ ${command} ${args.join(' ')}\x1b[0m`);
            }

            // Output: Runtime Stream (stdout/stderr)
            if (event.type === 'RUNTIME_OUTPUT') {
                const { stream, data } = event.payload;
                // Convert Unix newlines to CRLF for xterm
                const formatted = data.replace(/\n/g, '\r\n');

                if (stream === 'stderr') {
                    term.write(`\x1b[31m${formatted}\x1b[0m`); // Red for stderr
                } else {
                    term.write(formatted);
                }
            }

            // Output: Runtime Ready
            if (event.type === 'RUNTIME_READY') {
                term.writeln(`\x1b[32m[Container Ready]\x1b[0m`);
            }

            // Output: Exit Code
            if (event.type === 'RUNTIME_EXIT') {
                const exitCode = event.payload.exitCode;
                const color = exitCode === 0 ? '\x1b[32m' : '\x1b[31m';
                term.writeln(`${color}[Exit Code: ${exitCode}]\x1b[0m`);
                term.writeln('');
            }
        });

        // Handle Resize
        const resizeObserver = new ResizeObserver(() => {
            try {
                fitAddon.fit();
            } catch (e) {
                // Ignore resize errors during unmount
            }
        });
        resizeObserver.observe(containerRef.current);

        return () => {
            unsubscribe();
            resizeObserver.disconnect();
            term.dispose();
            termRef.current = null;
        };
    }, []);

    return (
        <div className="h-full w-full bg-[#1e1e1e] flex flex-col overflow-hidden">
            {/* Header Bar */}
            <div className="flex-none h-8 bg-[#2d2d2d] text-xs text-gray-300 px-3 flex items-center justify-between select-none border-b border-gray-700">
                <div className="flex items-center gap-2">
                    <span className="text-green-400">●</span>
                    <span className="font-medium">TERMINAL</span>
                    <span className="text-gray-500">|</span>
                    <span className="text-gray-400">Runtime Sandbox</span>
                </div>
                <span className="text-gray-500 text-xs">SharedArrayBuffer: Active</span>
            </div>

            {/* Terminal Container */}
            <div className="flex-1 overflow-hidden p-1" ref={containerRef} />
        </div>
    );
};

export default RuntimePanel;
