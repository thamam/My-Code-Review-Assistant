<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

# Theia — AI Code Review Assistant

**v0.3.0: The Explorer Update**

*Voice-First, Spec-Driven Code Review with L4 Autonomy*

</div>

---

## Features

- 🎤 **Voice Mode** — Hands-free code review with natural conversation
- 📋 **Spec Traceability** — Atomize requirements and verify code against specs
- 📊 **Diagram Navigation** — Clickable Mermaid diagrams that navigate to code
- 🌲 **Full Repo Access** — Browse and lazy-load any file in the repository
- 💬 **AI Chat** — Context-aware assistance powered by Gemini

---

## Quick Start

### Prerequisites
- Node.js 18+
- npm

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd My-Code-Review-Assistant

# Install dependencies
npm install
```

### Environment Setup

Create a `.env` file in the root directory:

```env
# Required
VITE_GEMINI_API_KEY=your_gemini_api_key

# Optional (for enhanced features)
VITE_GITHUB_TOKEN=your_github_token      # Increases API rate limits
VITE_LINEAR_API_KEY=your_linear_api_key  # For Linear integration

# For Voice Precision Mode (Google Cloud TTS)
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

### Run the App

```bash
# Development server
npm run dev

# Build for production
npm run build
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Testing

```bash
# Run all tests
npx playwright test --project=chromium

# Run specific test suite
npx playwright test tests/full-repo-integration.spec.ts --project=chromium

# Show test report
npx playwright show-report
```

---

## Architecture

| Component | Technology |
|-----------|------------|
| Frontend | React 19 + Vite + TypeScript |
| Styling | Tailwind CSS |
| AI Brain | Gemini 3 Pro Preview |
| Voice | Gemini 2.0 Flash (WebSocket) + Cloud TTS |
| Diagrams | Mermaid.js |

See [docs/architecture/system_handover_v0.3.0.md](docs/architecture/system_handover_v0.3.0.md) for detailed architecture.

---

## Usage

1. **Load a PR** — Paste a GitHub PR URL or click "Load Sample PR"
2. **Review Files** — Navigate the file tree and view diffs
3. **Use Voice** — Click "Voice Review" for hands-free mode
4. **Check Specs** — Link Linear issues or paste markdown specs
5. **Explore Diagrams** — Auto-generate architectural diagrams

---

## License

MIT

