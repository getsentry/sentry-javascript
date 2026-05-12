// Lighthouse CI configuration for Sentry JavaScript SDK performance testing.
// Used by treosh/lighthouse-ci-action@v12 via the `configPath` input.
// Docs: https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/configuration.md
//
// Per-cell environment variables (set by the GitHub Actions workflow):
//   LIGHTHOUSE_SERVE_MODE     - 'static' | 'server'
//   LIGHTHOUSE_STATIC_DIR     - absolute path to static dist dir (when serve mode = 'static')
//   LIGHTHOUSE_START_CMD      - shell command to start the server (when serve mode = 'server')
//   LIGHTHOUSE_READY_PATTERN  - server-ready log pattern (default: 'localhost')
//   LIGHTHOUSE_URL            - URL to audit (default: http://localhost:3000/)

const isServer = process.env.LIGHTHOUSE_SERVE_MODE === 'server';

export default {
  ci: {
    collect: {
      // Median of 5 runs halves variance vs a single run (per Lighthouse variability docs).
      numberOfRuns: 5,
      ...(isServer
        ? {
            startServerCommand: process.env.LIGHTHOUSE_START_CMD,
            startServerReadyPattern: process.env.LIGHTHOUSE_READY_PATTERN || 'localhost',
            startServerReadyTimeout: 30000,
            url: [process.env.LIGHTHOUSE_URL || 'http://localhost:3000/'],
          }
        : {
            staticDistDir: process.env.LIGHTHOUSE_STATIC_DIR,
          }),
      settings: {
        // Simulated throttling (LHCI default) — more deterministic on shared CI runners
        // than DevTools throttling. Do NOT switch to 'devtools' without dedicated hardware.
        chromeFlags: ['--no-sandbox', '--headless=new'],
        // Only measure performance — skip accessibility/SEO/PWA/best-practices for now.
        // These can be added later once the performance signal is stable.
        onlyCategories: ['performance'],
      },
    },
    assert: {
      // Warn-only — Lighthouse never blocks PR merges (ISC-A-1).
      // Floor is set very low (0.5) so we only catch catastrophic regressions while we
      // measure baseline variance. Tighten after 30+ days of nightly data.
      assertions: {
        'categories:performance': ['warn', { minScore: 0.5, aggregationMethod: 'median-run' }],
      },
    },
    upload: {
      // 7-day retention; zero infra required. Links appear in action output and the PR comment.
      target: 'temporary-public-storage',
    },
  },
};
