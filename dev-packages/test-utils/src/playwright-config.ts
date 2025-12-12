import type { PlaywrightTestConfig } from '@playwright/test';

interface PlaywrightConfigOptions {
  /** Command to start the test app (not needed when using Spotlight) */
  startCommand?: string;
  /** Port for the test app */
  port?: number;
  /** Port for the event proxy (legacy mode only) */
  eventProxyPort?: number;
  /** Path to the event proxy file (legacy mode only) */
  eventProxyFile?: string;
  /**
   * Use Spotlight instead of the custom event proxy server.
   * When enabled, Spotlight will automatically run the app and capture events.
   * The app's Sentry SDK should use the DSN workaround: http://spotlight@localhost:PORT/0
   */
  useSpotlight?: boolean;
  /** Port for Spotlight sidecar. Defaults to 8969. Use 0 for dynamic port. */
  spotlightPort?: number;
  /** Enable debug output for Spotlight */
  spotlightDebug?: boolean;
}

/** Get a playwright config to use in an E2E test app. */
export function getPlaywrightConfig(
  options?: PlaywrightConfigOptions,
  overwriteConfig?: Partial<PlaywrightTestConfig>,
): PlaywrightTestConfig {
  const testEnv = process.env['TEST_ENV'] || 'production';
  const appPort = options?.port || 3030;
  const useSpotlight = options?.useSpotlight || false;

  /**
   * See https://playwright.dev/docs/test-configuration.
   */
  const config: PlaywrightTestConfig = {
    testDir: './tests',
    /* Maximum time one test can run for. */
    timeout: 30_000,
    expect: {
      /**
       * Maximum time expect() should wait for the condition to be met.
       * For example in `await expect(locator).toHaveText();`
       */
      timeout: 10000,
    },
    fullyParallel: false,
    workers: 1,
    /* Fail the build on CI if you accidentally left test.only in the source code. */
    forbidOnly: !!process.env.CI,
    /* In dev mode some apps are flaky, so we allow retry there... */
    retries: testEnv === 'development' ? 3 : 0,
    /* Reporter to use. See https://playwright.dev/docs/test-reporters */
    reporter: process.env.CI ? [['line'], ['junit', { outputFile: 'results.junit.xml' }]] : 'list',
    /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
    use: {
      /* Maximum time each action such as `click()` can take. Defaults to 0 (no limit). */
      actionTimeout: 0,
      /* Base URL to use in actions like `await page.goto('/')`. */
      baseURL: `http://localhost:${appPort}`,

      /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
      trace: 'retain-on-failure',
    },

    /* Configure projects for major browsers */
    projects: [
      {
        name: 'chromium',
        use: {
          // This comes from `devices["Desktop Chrome"]` in Playwright 1.56.0
          // We inline this instead of importing this,
          // because playwright otherwise complains that it was imported twice :(
          userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.7390.37 Safari/537.36',
          viewport: { width: 1280, height: 720 },
          deviceScaleFactor: 1,
          isMobile: false,
          hasTouch: false,
          defaultBrowserType: 'chromium',
          // Use full chromium instead of headless shell to avoid ICU issues in WSL2
          channel: 'chromium',
        },
      },
    ],

    /* Run your local dev server before starting the tests */
    webServer: [],
  };

  if (useSpotlight) {
    // Spotlight mode: Use Spotlight to run the app and capture events
    // Spotlight auto-detects the start script from package.json
    const spotlightPort = options?.spotlightPort ?? 8969;
    const spotlightArgs = ['-f', 'json'];

    if (spotlightPort !== 0) {
      spotlightArgs.push('-p', String(spotlightPort));
    }

    if (options?.spotlightDebug) {
      spotlightArgs.push('-d');
    }

    // @ts-expect-error - we set `config.webserver` to an array above
    config.webServer.push({
      command: `yarn spotlight run ${spotlightArgs.join(' ')}`,
      port: appPort,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        PORT: appPort.toString(),
      },
    });
  } else {
    // Legacy mode: Use custom event proxy server
    const eventProxyPort = options?.eventProxyPort || 3031;
    const eventProxyFile = options?.eventProxyFile || 'start-event-proxy.mjs';
    const startCommand = options?.startCommand;

    // @ts-expect-error - we set `config.webserver` to an array above
    config.webServer.push({
      command: `node ${eventProxyFile}`,
      port: eventProxyPort,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    if (startCommand) {
      // @ts-expect-error - we set `config.webserver` to an array above
      config.webServer.push({
        command: startCommand,
        port: appPort,
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
          // Inherit all environment variables from the parent process
          // This is needed for env vars like NEXT_PUBLIC_SENTRY_SPOTLIGHT to be passed through
          ...process.env,
          PORT: appPort.toString(),
        },
      });
    }
  }

  return {
    ...config,
    ...overwriteConfig,
  };
}
