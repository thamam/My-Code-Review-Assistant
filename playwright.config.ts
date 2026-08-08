import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// import path from 'path';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * The dev server port e2e runs against. Hard-coding 5183 is fragile if
 * something else on the machine already owns that port — `reuseExistingServer`
 * (true outside CI) would then happily attach to that *other* server and every
 * test would run against the wrong app. Override with `PLAYWRIGHT_PORT` if 5183
 * is ever occupied; the default stays 5183 to match existing local habits.
 */
const PORT = process.env.PLAYWRIGHT_PORT ?? '5183';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  /* Exclude the vitest unit suite living under tests/unit/ — Playwright's
   * default testMatch would otherwise pick up those files too, and they
   * throw on import because they use vitest's ESM-only API. Also exclude
   * tests/quarantine/** — see tests/quarantine/README.md for why. */
  testIgnore: ['**/tests/unit/**', '**/tests/quarantine/**'],
  /* Global timeout for each test - 60 seconds to accommodate LLM latency */
  timeout: 60000,
  /* Expect assertion timeout - 30 seconds for AI-generated content */
  expect: {
    timeout: 30000,
  },
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /*
   * Reporter to use. See https://playwright.dev/docs/test-reporters
   * `open: 'never'` is load-bearing: the 'html' reporter's default behaviour
   * is to serve the report on a local port and block the process waiting for
   * Ctrl+C. That turns `npm run check` (which chains this as its last step)
   * into a command that never returns in an interactive terminal on a
   * failing e2e run — exactly the one command the README tells the owner to
   * run before considering a change done. 'list' gives immediate CLI
   * feedback; the html report still gets written to disk for later viewing
   * via `npx playwright show-report`.
   */
  reporter: [['list'], ['html', { open: 'never' }]],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('')`. */
    baseURL: `http://localhost:${PORT}`,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    headless: true,
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            '--use-file-for-fake-audio-capture=tests/fixtures/fake_audio.wav'
          ]
        }
      },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
