/**
 * src/modules/core/agent/toolRegistry.ts
 *
 * Concern 1 (Stage F decomposition): the eight tools available to the Agent's
 * Executor. Before this extraction, each tool's schema (a FunctionDeclaration
 * literal near the top of Agent.ts) lived ~1,100 lines away from its dispatch
 * implementation (a chain of `if (name === ...)` / `switch` in
 * executeTool). Adding or changing a tool meant editing two distant places
 * in one 1,500-line file. Here, each tool's schema, handler, and
 * read-only/side-effecting classification sit together in one
 * TOOL_DEFINITIONS entry.
 *
 * `submit_plan` (the Planner's tool) is deliberately NOT here: it is never
 * dispatched through executeTool — the Planner parses it directly out of
 * the function-call response — so it stays with the Planner in
 * plannerNode.ts. This registry is only the Executor's eight tools.
 */
import { FunctionDeclaration, Type } from "@google/genai";
import { eventBus } from "../EventBus";
import { searchService } from "../../search";
import { formatSearchCommand, formatWriteFileCommand } from "../../runtime/ToolUtils";
import { DiagramAgent } from "../../../services/diagramAgent";
import { ToolOutcome } from "./types";

/** Context a tool handler needs, beyond its own args, to do its job. */
export interface ToolDispatchContext {
  /** PR metadata passed in for this specific call (usually state.prData). */
  prData?: any;
  /** Timestamp (ms) of the most recent USER_ACTIVITY event — drives the Focus Lock. */
  lastUserInteraction: number;
  /**
   * Fallback PR data from the agent's last captured graph state. `propose_diagrams`
   * is the one handler that reads this — mirrors the original `prData || this.state?.prData`.
   */
  fallbackPrData?: any;
}

export type ToolHandler = (args: any, ctx: ToolDispatchContext) => Promise<string> | string;

export interface ToolDefinition {
  name: string;
  schema: FunctionDeclaration;
  /** UI-driving vs. knowledge-lookup grouping — mirrors the original uiTools/knowledgeTools split. */
  category: 'ui' | 'knowledge';
  /** Side-effecting tools require human approval before running (Phase 15 Gatekeeper). */
  sensitive: boolean;
  handler: ToolHandler;
}

// --- Gatekeeper: read-only carve-outs for otherwise-sensitive tools -------

// Terminal commands that only read. This list was dead until the executor started
// forwarding the model's real arguments — `args.command` was always undefined, so
// every terminal command fell through into the approval modal.
const READ_ONLY_COMMANDS = ['ls', 'find', 'grep', 'cat'];

// `find` can run arbitrary programs, delete files, or write output via its own
// primitives (-exec, -delete, -fprintf, -fls, ...). Deny-listing each mutating flag
// individually is a losing game, so only known-safe filtering/traversal flags are
// permitted; anything else re-arms the approval gate.
const FIND_SAFE_FLAGS = new Set(['-name', '-iname', '-type', '-maxdepth', '-path']);

/**
 * True when a terminal invocation is safe to run without asking the user.
 * Both the executable AND its arguments must be read-only: WebContainer spawns
 * (command, argv) directly with no shell, so argv is the only remaining escape hatch.
 */
export function isReadOnlyInvocation(name: string, args: any): boolean {
  if (name !== 'run_terminal_command') return false;
  if (!READ_ONLY_COMMANDS.includes(args?.command)) return false;

  // A non-array `args.args` isn't a shape the scan below understands — fail closed
  // rather than silently treating it as "no arguments" and skipping the scan.
  if (args?.args !== undefined && !Array.isArray(args.args)) return false;
  const argv: unknown[] = Array.isArray(args?.args) ? args.args : [];

  if (args.command === 'find') {
    return !argv.some(a => typeof a === 'string' && a.startsWith('-') && !FIND_SAFE_FLAGS.has(a));
  }

  return true;
}

// --- Runtime command execution ---------------------------------------------

/**
 * Executes a runtime command and waits for the exit signal.
 * Captures stdout/stderr into a single string.
 */
export function executeCommandAndWait(command: string, args: string[]): Promise<string> {
  const TIMEOUT_MS = 15000; // 15s timeout for any shell command

  return new Promise((resolve) => {
    let outputBuffer = '';
    let timer: any;

    // Definition of handlers
    const onOutput = (envelope: any) => {
      const event = envelope.event || envelope;
      if (event.type === 'RUNTIME_OUTPUT') {
        outputBuffer += event.payload.data;
      }
    };

    const onExit = (envelope: any) => {
      const event = envelope.event || envelope;
      if (event.type === 'RUNTIME_EXIT') {
        cleanup();
        const exitMsg = event.payload.exitCode === 0 ? '' : `\n[Exit Code: ${event.payload.exitCode}]`;
        resolve(outputBuffer + exitMsg);
      }
    };

    // Cleanup to prevent memory leaks
    const cleanup = () => {
      unsubOutput();
      unsubExit();
      clearTimeout(timer);
    };

    // Subscribe to EventBus
    const unsubOutput = eventBus.subscribe('RUNTIME_OUTPUT', onOutput);
    const unsubExit = eventBus.subscribe('RUNTIME_EXIT', onExit);

    // Safety Timeout
    timer = setTimeout(() => {
      console.warn(`[Agent] Command timed out: ${command} ${args.join(' ')}`);
      cleanup();
      resolve(outputBuffer + `\n[Error: Command timed out after ${TIMEOUT_MS}ms]`);
    }, TIMEOUT_MS);

    // Trigger the Nervous System
    eventBus.emit({
      type: 'AGENT_EXEC_CMD',
      payload: { command, args, timestamp: Date.now() }
    });
  });
}

// --- Tool handlers -----------------------------------------------------

async function handleRunTerminalCommand(args: any): Promise<string> {
  return executeCommandAndWait(args.command, args.args || []);
}

function handleFindFile(args: any): string {
  // Map 'name' arg to 'query' for searchService
  const results = searchService.search(args.name);

  if (results.length === 0) {
    return "No files found with that name.";
  }

  return `Found files:\n` + results.map(r => `- ${r.id}`).join('\n');
}

async function handleSearchText(args: any): Promise<string> {
  const nodeScript = formatSearchCommand(args.query);
  return executeCommandAndWait('node', ['-e', nodeScript]);
}

async function handleProposeDiagrams(args: any, ctx: ToolDispatchContext): Promise<string> {
  const diagramAgent = new DiagramAgent();
  try {
    const targetPR = ctx.prData || ctx.fallbackPrData;
    if (!targetPR) return "Error: No PR data available for diagram generation.";

    let diagrams = [];
    if (args.prompt) {
      const custom = await diagramAgent.generateCustomDiagram(targetPR, args.prompt);
      diagrams = [custom];
    } else {
      diagrams = await diagramAgent.proposeDiagrams(targetPR);
    }

    const mermaidBlocks = diagrams.map(d => `### ${d.title}\n${d.description}\n\n\`\`\`mermaid\n${d.mermaidCode}\n\`\`\``).join('\n\n');
    return `Generated ${diagrams.length} diagrams:\n\n${mermaidBlocks}`;
  } catch (e: any) {
    return `Diagram generation failed: ${e.message}`;
  }
}

async function handleWriteFile(args: any): Promise<string> {
  const nodeScript = formatWriteFileCommand(args.path, args.content);
  return executeCommandAndWait('node', ['-e', nodeScript]);
}

function handleNavigateToCode(args: any, ctx: ToolDispatchContext): string {
  const timestamp = Date.now();
  // FR-042: Focus Lock - Don't steal focus if user was active in last 3 seconds
  if (Date.now() - ctx.lastUserInteraction < 3000) {
    console.log('[Focus Lock] Navigation skipped - user is active');
    return 'Navigation skipped (Focus Locked by User)';
  }
  eventBus.emit({
    type: 'AGENT_NAVIGATE',
    payload: {
      target: {
        file: args.filepath,
        line: args.line || 1
      },
      reason: 'Tool execution',
      highlight: true,
      timestamp
    }
  });
  console.log(`[TheiaAgent] AGENT_NAVIGATE emitted: ${args.filepath}:${args.line || 1}`);
  return `Mapped to ${args.filepath}`;
}

function handleChangeTab(args: any): string {
  const timestamp = Date.now();
  eventBus.emit({
    type: 'AGENT_TAB_SWITCH',
    payload: {
      tab: args.tab_name,
      timestamp
    }
  });
  console.log(`[TheiaAgent] AGENT_TAB_SWITCH emitted: ${args.tab_name}`);
  return `Switched tab to ${args.tab_name}`;
}

function handleToggleDiffMode(args: any): string {
  const timestamp = Date.now();
  eventBus.emit({
    type: 'AGENT_DIFF_MODE',
    payload: {
      enable: args.enable,
      timestamp
    }
  });
  console.log(`[TheiaAgent] AGENT_DIFF_MODE emitted: ${args.enable}`);
  return `Toggled Diff Mode`;
}

// --- The registry --------------------------------------------------------

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  // --- UI Tools (Sync/Fire-and-Forget), except run_terminal_command/write_file ---
  {
    name: 'navigate_to_code',
    category: 'ui',
    sensitive: false,
    handler: handleNavigateToCode,
    schema: {
      name: "navigate_to_code",
      description: "Navigate to a specific file and line number in the code viewer.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          filepath: { type: Type.STRING, description: "The file path to navigate to" },
          line: { type: Type.NUMBER, description: "The line number to jump to" }
        },
        required: ["filepath"]
      }
    }
  },
  {
    name: 'change_tab',
    category: 'ui',
    sensitive: false,
    handler: handleChangeTab,
    schema: {
      name: "change_tab",
      description: "Switch the application sidebar tab.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          tab_name: { type: Type.STRING, enum: ["files", "annotations", "issue", "diagrams", "terminal"] }
        },
        required: ["tab_name"]
      }
    }
  },
  {
    name: 'toggle_diff_mode',
    category: 'ui',
    sensitive: false,
    handler: handleToggleDiffMode,
    schema: {
      name: "toggle_diff_mode",
      description: "Enable or disable diff mode to show/hide code changes.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          enable: { type: Type.BOOLEAN, description: "True to show diff, false to hide" }
        },
        required: ["enable"]
      }
    }
  },
  // Phase 15: The Gatekeeper - run_terminal_command and write_file require human approval
  // unless isReadOnlyInvocation() carves out a safe read-only sub-case (run_terminal_command only).
  {
    name: 'run_terminal_command',
    category: 'ui',
    sensitive: true,
    handler: handleRunTerminalCommand,
    schema: {
      name: "run_terminal_command",
      description: "Execute a shell command in the runtime terminal. Use this to run tests, install packages, check node version, or verify builds.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          command: { type: Type.STRING, description: "The command to run (e.g., 'npm', 'node', 'ls')" },
          args: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Arguments for the command" }
        },
        required: ["command"]
      }
    }
  },
  {
    name: 'write_file',
    category: 'ui',
    sensitive: true,
    handler: handleWriteFile,
    schema: {
      name: "write_file",
      description: "Create or overwrite a file with the specified content. Use this to create new files or modify existing ones.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          path: { type: Type.STRING, description: "The file path relative to the project root (e.g., 'src/test.txt')" },
          content: { type: Type.STRING, description: "The content to write to the file" }
        },
        required: ["path", "content"]
      }
    }
  },
  // --- Knowledge Tools (The Librarian - Phase 14) ---
  {
    name: 'find_file',
    category: 'knowledge',
    sensitive: false,
    handler: handleFindFile,
    schema: {
      name: "find_file",
      description: "Find a file by its name. Use this to locate files when you know part of the filename.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: "The filename fragment (e.g., 'Agent', 'Service')" }
        },
        required: ["name"]
      }
    }
  },
  {
    name: 'search_text',
    category: 'knowledge',
    sensitive: false,
    handler: handleSearchText,
    schema: {
      name: "search_text",
      description: "Search for a text string or symbol inside ALL files. Use this to find where a class, function, or variable is defined.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: { type: Type.STRING, description: "The exact string to search for (e.g., 'interface AgentState', 'function run')" }
        },
        required: ["query"]
      }
    }
  },
  {
    name: 'propose_diagrams',
    category: 'knowledge',
    sensitive: false,
    handler: handleProposeDiagrams,
    schema: {
      name: "propose_diagrams",
      description: "Generate high-value Mermaid.js diagrams for the current PR or codebase. Use this when the user asks for architecture, flow, or visualization.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          prompt: { type: Type.STRING, description: "Specific instructions for the diagram (optional)" }
        }
      }
    }
  },
];

const TOOL_MAP = new Map(TOOL_DEFINITIONS.map(t => [t.name, t]));

// Preserves the exact original grouping/ordering: uiTools = [navigate_to_code,
// change_tab, toggle_diff_mode, run_terminal_command, write_file], knowledgeTools
// = [find_file, search_text, propose_diagrams], executorTools = [...uiTools, ...knowledgeTools].
export const uiTools: FunctionDeclaration[] = TOOL_DEFINITIONS.filter(t => t.category === 'ui').map(t => t.schema);
export const knowledgeTools: FunctionDeclaration[] = TOOL_DEFINITIONS.filter(t => t.category === 'knowledge').map(t => t.schema);
export const executorTools: FunctionDeclaration[] = [...uiTools, ...knowledgeTools];

export const SENSITIVE_TOOLS: string[] = TOOL_DEFINITIONS.filter(t => t.sensitive).map(t => t.name);

/**
 * Execute a tool by name, dispatching to its registered handler.
 * Returns a Promise<string> for async tools like terminal commands.
 */
export async function dispatchTool(name: string, args: any, ctx: ToolDispatchContext): Promise<string> {
  const tool = TOOL_MAP.get(name);
  if (!tool) {
    console.warn(`[TheiaAgent] Unknown tool: ${name}`);
    return "Unknown tool";
  }
  return tool.handler(args, ctx);
}

/**
 * Scores a tool's raw output into a structural ToolOutcome (The Judge).
 * A safety-timeout resolves (it does not throw) so the partial output survives,
 * but it must never be scored as success — the command never actually finished.
 */
export function scoreToolOutcome(output: string): ToolOutcome {
  if (output.includes('[Error: Command timed out')) {
    return { output, ok: false, exitCode: null };
  }

  const exitCodeMatch = output.match(/\[Exit Code: (\d+)\]/);
  const exitCode = exitCodeMatch ? parseInt(exitCodeMatch[1], 10) : null;
  return { output, ok: exitCode === null || exitCode === 0, exitCode };
}
