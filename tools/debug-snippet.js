/**
 * THEIA BLACK BOX DEBUGGER
 * =========================
 * 
 * HOW TO USE:
 * 1. Open your browser's Developer Tools (Cmd+Option+I / F12)
 * 2. Go to the "Console" tab
 * 3. Copy-paste this entire script and press Enter
 * 4. The Agent's current state will be logged to the console
 * 
 * Use this to diagnose issues during QA sessions.
 */

(function () {
    const STORAGE_KEY = 'THEIA_AGENT_STATE_V1';

    try {
        const raw = localStorage.getItem(STORAGE_KEY);

        if (!raw) {
            console.warn('⚠️ No saved session found in localStorage.');
            return;
        }

        const state = JSON.parse(raw);

        // Extract plan details
        const plan = state.plan || {};
        const activeStep = plan.steps?.[plan.activeStepIndex] || null;

        // Get last 10 messages (simplified)
        const messages = state.messages || [];
        const recentHistory = messages.slice(-10).map((msg, i) => ({
            index: messages.length - 10 + i,
            role: msg.role,
            preview: (msg.content || '').substring(0, 80) + (msg.content?.length > 80 ? '...' : '')
        }));

        // Build the debug report
        const report = {
            timestamp: {
                savedAt: state.savedAt ? new Date(state.savedAt).toISOString() : 'Unknown',
                readAt: new Date().toISOString()
            },
            plan: {
                id: plan.id || null,
                goal: plan.goal || null,
                status: plan.status || 'none',
                totalSteps: plan.steps?.length || 0,
                activeStepIndex: plan.activeStepIndex ?? null
            },
            activeStep: activeStep ? {
                id: activeStep.id,
                description: activeStep.description,
                tool: activeStep.tool || 'unknown',
                status: activeStep.status,
                result: activeStep.result ? activeStep.result.substring(0, 200) : null
            } : null,
            pendingAction: state.pendingAction || null,
            lastError: state.lastError || null,
            recentHistory: recentHistory
        };

        console.log('🔍 THEIA BLACK BOX DUMP:');
        console.log(JSON.stringify(report, null, 2));

        // Also log as expandable object for easier exploration
        console.log('📦 Full State Object:', state);

        return report;

    } catch (err) {
        console.error('❌ Failed to parse localStorage state:', err);
    }
})();
