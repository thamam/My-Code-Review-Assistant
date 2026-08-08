# Development Guide - My-Code-Review-Assistant

## Prerequisites

- **Node.js:** v18+ (required for WebContainer compatibility)
- **NPM:** v9+
- **API Keys:** 
  - Google Gemini API Key (set in `.env`)
  - (Optional) GitHub Token for private repos

## Installation

```bash
# Clone the repository
git clone https://github.com/your-repo/My-Code-Review-Assistant.git
cd My-Code-Review-Assistant

# Install dependencies
npm install
```

## Environment Setup

Create a `.env` file in the root directory:

```env
VITE_GEMINI_API_KEY=your_key_here
VITE_GITHUB_TOKEN=your_token_here (optional)
```

## Local Development

```bash
# Start Vite development server
npm run dev
```

The application will be available at `http://localhost:5173`.

## Testing

The project uses a "Verification Driven Development" approach with Playwright and Vitest.

```bash
# Run all E2E tests (Playwright)
npm run test:e2e

# Run specific suite (e.g., Director Service)
npm run test:e2e:director

# Run unit tests (Vitest)
npx vitest

# Run verification guards (Voice, Context, Director)
npm run test:guards
```

## Build and Preview

```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

## Documentation Standards

- **Specifications:** All new features must be added to `docs/specs/REQUIREMENTS.csv`.
- **Architecture:** Major changes should be documented in `docs/architecture/` using ADRs or updated modules.
- **QA:** Results of manual and automated testing should be logged in `QA_LOG.md`.
