/**
 * Unit Test: DirectorService
 * 
 * Tests the core Director logic:
 * - formatBriefAsWhisper produces valid whisper format
 * - ContextBrief structure validation
 * 
 * Run: npx tsx scripts/test-director-service.ts
 */

import { formatBriefAsWhisper } from '../src/services/DirectorService';
import type { ContextBrief } from '../src/types/contextBrief';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
    try {
        fn();
        console.log(`${GREEN}✓${RESET} ${name}`);
        passed++;
    } catch (e: any) {
        console.log(`${RED}✗${RESET} ${name}`);
        console.log(`  ${e.message}`);
        failed++;
    }
}

function assert(condition: boolean, message: string) {
    if (!condition) throw new Error(message);
}

// --- Tests ---

test('formatBriefAsWhisper includes DO NOT READ ALOUD prefix', () => {
    const brief: ContextBrief = {
        generatedAt: new Date().toISOString(),
        activeFile: {
            path: 'src/test.ts',
            summary: 'A test file',
            highlights: [{ lines: '1-10', reason: 'Main logic' }]
        },
        keyFacts: ['Fact 1', 'Fact 2'],
        suggestedTopics: ['Topic 1']
    };

    const whisper = formatBriefAsWhisper(brief);

    assert(
        whisper.startsWith('[CONTEXT UPDATE - DO NOT READ ALOUD]'),
        'Whisper must start with [CONTEXT UPDATE - DO NOT READ ALOUD]'
    );
});

test('formatBriefAsWhisper includes file path', () => {
    const brief: ContextBrief = {
        generatedAt: new Date().toISOString(),
        activeFile: {
            path: 'src/utils/helper.ts',
            summary: 'Helper utilities',
            highlights: []
        },
        keyFacts: [],
        suggestedTopics: []
    };

    const whisper = formatBriefAsWhisper(brief);

    assert(
        whisper.includes('src/utils/helper.ts'),
        'Whisper must include file path'
    );
});

test('formatBriefAsWhisper handles null activeFile', () => {
    const brief: ContextBrief = {
        generatedAt: new Date().toISOString(),
        activeFile: null,
        keyFacts: ['General fact'],
        suggestedTopics: []
    };

    const whisper = formatBriefAsWhisper(brief);

    assert(
        whisper.includes('No file'),
        'Whisper should indicate no file when activeFile is null'
    );
});

test('formatBriefAsWhisper includes Linear context when present', () => {
    const brief: ContextBrief = {
        generatedAt: new Date().toISOString(),
        activeFile: null,
        keyFacts: [],
        suggestedTopics: [],
        linearContext: {
            issueId: 'THX-123',
            relevance: 'Implements the auth flow'
        }
    };

    const whisper = formatBriefAsWhisper(brief);

    assert(
        whisper.includes('THX-123'),
        'Whisper must include Linear issue ID'
    );
    assert(
        whisper.includes('Implements the auth flow'),
        'Whisper must include Linear relevance'
    );
});

test('formatBriefAsWhisper includes key facts', () => {
    const brief: ContextBrief = {
        generatedAt: new Date().toISOString(),
        activeFile: null,
        keyFacts: ['First important fact', 'Second important fact'],
        suggestedTopics: []
    };

    const whisper = formatBriefAsWhisper(brief);

    assert(
        whisper.includes('First important fact'),
        'Whisper must include first key fact'
    );
    assert(
        whisper.includes('Second important fact'),
        'Whisper must include second key fact'
    );
});

test('formatBriefAsWhisper includes suggested topics', () => {
    const brief: ContextBrief = {
        generatedAt: new Date().toISOString(),
        activeFile: null,
        keyFacts: [],
        suggestedTopics: ['Why this approach', 'Alternative options']
    };

    const whisper = formatBriefAsWhisper(brief);

    assert(
        whisper.includes('Why this approach'),
        'Whisper must include suggested topics'
    );
});

// --- Summary ---

console.log('\n---');
console.log(`Passed: ${passed}, Failed: ${failed}`);

if (failed > 0) {
    process.exit(1);
}
