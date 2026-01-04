/**
 * src/modules/runtime/types.ts
 * Type definitions for the Runtime Sandbox module.
 */

// ============================================================================
// RUNTIME CONFIGURATION
// ============================================================================

export interface RuntimeConfig {
    /** Maximum time to wait for container boot (ms) */
    bootTimeout: number;
    /** Default working directory inside the container */
    workDir: string;
    /** Environment variables to set in the container */
    env: Record<string, string>;
}

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
    bootTimeout: 30000,
    workDir: '/app',
    env: {
        NODE_ENV: 'development',
    },
};

// ============================================================================
// RUNTIME STATE
// ============================================================================

export type RuntimeStatus =
    | 'idle'           // Container not started
    | 'booting'        // Container is starting up
    | 'ready'          // Container is ready to accept commands
    | 'executing'      // A command is currently running
    | 'error';         // Container encountered an error

export interface RuntimeState {
    status: RuntimeStatus;
    serverUrl: string | null;
    currentCommand: string | null;
    lastExitCode: number | null;
    bootedAt: number | null;
}

export const INITIAL_RUNTIME_STATE: RuntimeState = {
    status: 'idle',
    serverUrl: null,
    currentCommand: null,
    lastExitCode: null,
    bootedAt: null,
};

// ============================================================================
// COMMAND EXECUTION
// ============================================================================

export interface CommandRequest {
    /** The command to run (e.g., 'npm') */
    command: string;
    /** Arguments for the command (e.g., ['install']) */
    args: string[];
    /** Working directory for the command */
    cwd?: string;
    /** Environment variables for this command */
    env?: Record<string, string>;
}

export interface CommandResult {
    /** Exit code of the command */
    exitCode: number;
    /** Stdout output */
    stdout: string;
    /** Stderr output */
    stderr: string;
    /** Time taken to execute (ms) */
    duration: number;
}

// ============================================================================
// FILE SYSTEM OPERATIONS
// ============================================================================

export interface FileOperation {
    type: 'write' | 'mkdir' | 'rm';
    path: string;
    content?: string;
}

export interface FileTree {
    [path: string]: FileTreeNode;
}

export interface FileTreeNode {
    file?: { contents: string };
    directory?: FileTree;
}
