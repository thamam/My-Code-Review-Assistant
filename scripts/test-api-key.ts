// Simple API Key Test for Gemini Live API
// Run with: npx tsx scripts/test-api-key.ts

import 'dotenv/config';
import { GoogleGenAI, Modality } from '@google/genai';

const API_KEY = process.env.VITE_GEMINI_API_KEY;

if (!API_KEY) {
    console.error('❌ VITE_GEMINI_API_KEY not found in environment');
    process.exit(1);
}

console.log('🔑 API Key found (first 10 chars):', API_KEY.substring(0, 10) + '...');

const ai = new GoogleGenAI({ apiKey: API_KEY });

// Test 1: Simple text generation (non-live)
async function testTextGeneration() {
    console.log('\n📝 Test 1: Basic text generation...');
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash-exp',
            contents: 'Say "Hello, the API key works!" and nothing else.',
        });
        console.log('✅ Text generation works:', response.text);
        return true;
    } catch (e: any) {
        console.error('❌ Text generation failed:', e.message);
        return false;
    }
}

// Test 2: Live API connection
async function testLiveConnection() {
    console.log('\n🔴 Test 2: Live API connection...');

    // Try different model names
    const models = [
        'gemini-2.0-flash-exp',
        'gemini-live-2.5-flash-preview', // From official docs for non-Vertex
    ];

    for (const model of models) {
        console.log(`\n   Trying model: ${model}`);
        try {
            const session = await ai.live.connect({
                model: model,
                config: {
                    responseModalities: [Modality.AUDIO],
                },
                callbacks: {
                    onopen: () => {
                        console.log('   ✅ Session OPENED successfully!');
                    },
                    onmessage: (msg) => {
                        console.log('   📩 Message received:', JSON.stringify(msg).substring(0, 100));
                    },
                    onerror: (err) => {
                        console.error('   ❌ Session error:', err);
                    },
                    onclose: (e: any) => {
                        console.log('   🔒 Session closed. Code:', e?.code, 'Reason:', e?.reason || 'none');
                    },
                },
            });

            // Keep connection open for 5 seconds to see if it stays
            console.log('   ⏳ Waiting 5 seconds to see if connection stays open...');
            await new Promise(resolve => setTimeout(resolve, 5000));

            // Try to send a simple text message
            try {
                session.sendRealtimeInput({ text: 'Hello, can you hear me?' });
                console.log('   📤 Sent text message');
            } catch (sendErr: any) {
                console.error('   ❌ Failed to send:', sendErr.message);
            }

            await new Promise(resolve => setTimeout(resolve, 2000));
            session.close();
            console.log('   ✅ Test complete for', model);
            return true;
        } catch (e: any) {
            console.error(`   ❌ Failed with ${model}:`, e.message);
        }
    }
    return false;
}

async function main() {
    console.log('🚀 Starting API Key Tests\n');
    console.log('='.repeat(50));

    const textOk = await testTextGeneration();
    const liveOk = await testLiveConnection();

    console.log('\n' + '='.repeat(50));
    console.log('📊 Results:');
    console.log('   Text Generation:', textOk ? '✅ PASS' : '❌ FAIL');
    console.log('   Live Connection:', liveOk ? '✅ PASS' : '❌ FAIL');
}

main().catch(console.error);
