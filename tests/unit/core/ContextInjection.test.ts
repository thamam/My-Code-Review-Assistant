
import { describe, it, expect, vi } from 'vitest';
import { agent } from '../../../src/modules/core/Agent';

// Access private method via 'any' casting for testing purposes
const agentAny = agent as any;

describe('Agent Context Injection (Operation Vision Restore)', () => {
    
    it('should inject ACTIVE_FILE when context is present', () => {
        const context = { activeFile: 'src/main.ts', activeTab: 'files' };
        const envelope = agentAny.buildContextEnvelope('Hello', context);
        
        expect(envelope).toContain('ACTIVE_FILE: src/main.ts');
        expect(envelope).not.toContain('WARNING: No active file detected');
    });

    it('should inject WARNING when activeFile is missing', () => {
        const context = { activeFile: null, activeTab: 'files' };
        const envelope = agentAny.buildContextEnvelope('Hello', context);
        
        expect(envelope).toContain('ACTIVE_FILE: None');
        expect(envelope).toContain('WARNING: No active file detected');
        expect(envelope).toContain('DO NOT GUESS filenames');
    });

    it('should handle undefined context gracefully', () => {
        const envelope = agentAny.buildContextEnvelope('Hello', undefined);
        expect(envelope).toContain('USER_QUERY: Hello');
        // Should not crash, and prompt should not have system context block
        expect(envelope).not.toContain('[SYSTEM_CONTEXT]');
    });
});
