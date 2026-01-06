/**
 * src/modules/planner/types.ts
 * The Data Structure for Deliberative Reasoning.
 */

export type StepStatus = 'pending' | 'active' | 'completed' | 'failed' | 'skipped';

export interface PlanStep {
    id: string;
    description: string; // e.g., "Run npm test to reproduce error"
    tool?: string;       // Suggested tool
    status: StepStatus;
    result?: string;     // Output from execution
}

export interface AgentPlan {
    id: string;
    goal: string;        // The high-level user request
    steps: PlanStep[];
    activeStepIndex: number;
    status: 'planning' | 'executing' | 'verifying' | 'completed' | 'failed';
    generatedAt: number;
}
