// Generate a valid 5-second WAV file with silence for Playwright fake audio capture
const fs = require('fs');
const path = require('path');

const sampleRate = 16000;
const numChannels = 1;
const bitsPerSample = 16;
const durationSeconds = 5;

const numSamples = sampleRate * durationSeconds;
const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
const blockAlign = numChannels * (bitsPerSample / 8);
const dataSize = numSamples * numChannels * (bitsPerSample / 8);
const fileSize = 36 + dataSize;

// Create WAV file buffer
const buffer = Buffer.alloc(44 + dataSize);

// RIFF header
buffer.write('RIFF', 0);
buffer.writeUInt32LE(fileSize, 4);
buffer.write('WAVE', 8);

// fmt subchunk
buffer.write('fmt ', 12);
buffer.writeUInt32LE(16, 16); // Subchunk1Size for PCM
buffer.writeUInt16LE(1, 20);  // AudioFormat (1 = PCM)
buffer.writeUInt16LE(numChannels, 22);
buffer.writeUInt32LE(sampleRate, 24);
buffer.writeUInt32LE(byteRate, 28);
buffer.writeUInt16LE(blockAlign, 32);
buffer.writeUInt16LE(bitsPerSample, 34);

// data subchunk
buffer.write('data', 36);
buffer.writeUInt32LE(dataSize, 40);

// Audio data (silence = all zeros, already zero from Buffer.alloc)

// Write file
const outputPath = path.join(__dirname, 'fake_audio.wav');
fs.writeFileSync(outputPath, buffer);
console.log(`Created ${outputPath} (${buffer.length} bytes)`);
