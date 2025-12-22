/**
 * Voice Configuration Guard Tests
 * 
 * These tests verify that critical LiveContext voice mode configuration
 * is present. They were added after a regression where voice config was
 * accidentally removed during debugging.
 * 
 * Run: npx tsx scripts/test-live-config.ts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LIVE_CONTEXT_PATH = path.join(__dirname, '../contexts/LiveContext.tsx');

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

const REQUIRED_CONFIGS: ConfigCheck[] = [
    {
        name: 'inputAudioTranscription',
        pattern: /inputAudioTranscription\s*:\s*\{\}/,
        description: 'Enables user speech-to-text captions in chat window'
    },
    {
        name: 'outputAudioTranscription',
        pattern: /outputAudioTranscription\s*:\s*\{\}/,
        description: 'Enables AI speech-to-text captions in chat window'
    },
    {
        name: 'speechConfig.voiceConfig',
        pattern: /speechConfig\s*:\s*\{[\s\S]*?voiceConfig\s*:\s*\{[\s\S]*?prebuiltVoiceConfig\s*:\s*\{[\s\S]*?voiceName\s*:/,
        description: 'Sets the AI voice (e.g., Zephyr)'
    },
    {
        name: 'voiceName: Zephyr',
        pattern: /voiceName\s*:\s*['"]Zephyr['"]/,
        description: 'Ensures Zephyr voice is configured (the intended voice)'
    }
];

function runTests(): void {
    console.log(`\n${YELLOW}🎤 Voice Configuration Guard Tests${RESET}\n`);
    console.log(`Checking: ${LIVE_CONTEXT_PATH}\n`);

    if (!fs.existsSync(LIVE_CONTEXT_PATH)) {
        console.error(`${RED}❌ FATAL: LiveContext.tsx not found!${RESET}`);
        process.exit(1);
    }

    const content = fs.readFileSync(LIVE_CONTEXT_PATH, 'utf-8');

    let passed = 0;
    let failed = 0;
    const failures: string[] = [];

    for (const check of REQUIRED_CONFIGS) {
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
        console.log(`Missing configurations:`);
        failures.forEach(f => console.log(`  - ${f}`));
        console.log(`\n${YELLOW}These settings are required for voice mode to work correctly.${RESET}`);
        console.log(`Please restore them in LiveContext.tsx config section.\n`);
        process.exit(1);
    } else {
        console.log(`\n${GREEN}✓ All voice configurations present.${RESET}\n`);
        process.exit(0);
    }
}

runTests();
