/**
 * Context Injection Guard Tests
 * 
 * These tests verify that critical ChatContext context injection code
 * is present. They guard against regressions where file content injection
 * might be accidentally removed.
 * 
 * Run: npx tsx scripts/test-context-injection.ts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CHAT_CONTEXT_PATH = path.join(__dirname, '../contexts/ChatContext.tsx');

// ANSI colors for output
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

interface ConfigCheck {
    name: string;
    pattern: RegExp;
    description: string;
}

const REQUIRED_PATTERNS: ConfigCheck[] = [
    {
        name: 'File Content Lookup',
        pattern: /prData\.files\.find\(f\s*=>\s*f\.path\s*===\s*activeFilePath\)/,
        description: 'Looks up active file content from prData.files'
    },
    {
        name: 'Line Number Injection',
        pattern: /\.map\(\(line,\s*i\)\s*=>/,
        description: 'Adds line numbers to file content for accurate references'
    },
    {
        name: 'Context Suffix with File Content',
        pattern: /\[FILE CONTENT - USE THIS FOR LINE REFERENCES\]/,
        description: 'Injects file content with clear labeling for AI grounding'
    },
    {
        name: 'Console.log Verification',
        pattern: /console\.log\('\[Theia\] Context Payload:'/,
        description: 'Logs context payload for debugging verification'
    },
    {
        name: 'Anti-Hallucination Constraints',
        pattern: /PROJECT MANIFEST.*TRUTH|HARD CONSTRAINTS/,
        description: 'System prompt includes anti-hallucination rules'
    },
    {
        name: 'No Line Guessing Rule',
        pattern: /NO GUESSING LINE NUMBERS|NEVER cite a line number unless/i,
        description: 'Prevents AI from inventing line numbers'
    },
    {
        name: 'Action Over Asking Rule',
        pattern: /ACTION OVER ASKING|DO NOT ask.*Would you like/i,
        description: 'Forces proactive tool use instead of asking permission'
    }
];

function runTests(): void {
    console.log(`\n${YELLOW}🔍 Context Injection Guard Tests${RESET}\n`);
    console.log(`Checking: ${CHAT_CONTEXT_PATH}\n`);

    if (!fs.existsSync(CHAT_CONTEXT_PATH)) {
        console.error(`${RED}❌ FATAL: ChatContext.tsx not found!${RESET}`);
        process.exit(1);
    }

    const content = fs.readFileSync(CHAT_CONTEXT_PATH, 'utf-8');

    let passed = 0;
    let failed = 0;
    const failures: string[] = [];

    for (const check of REQUIRED_PATTERNS) {
        const found = check.pattern.test(content);

        if (found) {
            console.log(`${GREEN}✓${RESET} ${check.name}`);
            passed++;
        } else {
            console.log(`${RED}✗${RESET} ${check.name}`);
            console.log(`  ${YELLOW}→ ${check.description}${RESET}`);
            failures.push(check.name);
            failed++;
        }
    }

    console.log(`\n${'─'.repeat(50)}`);
    console.log(`Results: ${GREEN}${passed} passed${RESET}, ${failed > 0 ? RED : ''}${failed} failed${RESET}`);

    if (failed > 0) {
        console.log(`\n${RED}❌ REGRESSION DETECTED!${RESET}`);
        console.log(`Missing patterns:`);
        failures.forEach(f => console.log(`  - ${f}`));
        console.log(`\n${YELLOW}Context injection is required to prevent AI hallucinations.${RESET}`);
        console.log(`Please ensure ChatContext.tsx injects file content into messages.\n`);
        process.exit(1);
    } else {
        console.log(`\n${GREEN}✓ All context injection patterns present.${RESET}\n`);
        process.exit(0);
    }
}

runTests();
