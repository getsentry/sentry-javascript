/**
 * Generates the GitHub Actions matrix for Lighthouse CI runs.
 *
 * Outputs: `matrix=<JSON>` to stdout (consumed by $GITHUB_OUTPUT in CI).
 *
 * Matrix shape: 2 E2E apps × 3 Sentry feature modes = 6 cells (MVP scope).
 *
 * Only apps whose Sentry init code actually branches on SENTRY_LIGHTHOUSE_MODE are
 * included here. Adding an app without that wiring produces three identical builds
 * — same SDK, same integrations — so the `Δ (SDK)` and `Δ (Features)` columns in
 * the PR comment become noise. The follow-up todo `TODO-aeab11f0` tracks instrumenting
 * react-19, vue-3, svelte-5, sveltekit-2, astro-5, tanstackstart-react, and nuxt-5 so
 * they can be added back here. react-router-7-spa is also instrumented but currently
 * fails Lighthouse with NO_FCP — kept out of the matrix until that's diagnosed.
 *
 * Modes:
 *   no-sentry      — app built without any Sentry SDK (baseline)
 *   init-only      — Sentry.init() only, no additional integrations
 *   tracing-replay — Sentry.init() with browserTracingIntegration + replayIntegration
 *
 * Each E2E app reads SENTRY_LIGHTHOUSE_MODE at build time. Because bundlers expose
 * env vars under different prefixes (NEXT_PUBLIC_*, PUBLIC_*, VITE_*, etc.), the
 * workflow sets the var under every common prefix; each app reads whichever its
 * bundler exposes. The `envVarName` field below is informational (used in the
 * report) and documents which prefix the app code actually consumes.
 */

/**
 * @typedef {Object} AppDefinition
 * @property {string} app             - Directory name under dev-packages/e2e-tests/test-applications/
 * @property {string} sdk             - Human-readable SDK label for reports
 * @property {'static'|'server'} serve - How the built app is served by Lighthouse
 * @property {string} [staticDir]      - Relative path to built static assets (serve === 'static')
 * @property {string} [startCmd]       - Command to start the SSR server (serve === 'server')
 * @property {string} [readyPattern]   - Log pattern that signals server is ready (server only)
 * @property {string} envVarName       - Env var the app's Sentry init code reads at build time
 */

/** @type {AppDefinition[]} */
const APPS = [
  // Plain webpack app — reads `process.env.SENTRY_LIGHTHOUSE_MODE` directly.
  { app: 'default-browser', sdk: 'browser', serve: 'static', staticDir: 'build', envVarName: 'SENTRY_LIGHTHOUSE_MODE' },

  // Next.js — reads `process.env.NEXT_PUBLIC_SENTRY_LIGHTHOUSE_MODE` (client-exposed env var prefix).
  {
    app: 'nextjs-16',
    sdk: 'nextjs',
    serve: 'server',
    startCmd: 'pnpm start',
    readyPattern: 'Ready in',
    envVarName: 'NEXT_PUBLIC_SENTRY_LIGHTHOUSE_MODE',
  },
];

const MODES = /** @type {const} */ (['no-sentry', 'init-only', 'tracing-replay']);

const include = [];

for (const appDef of APPS) {
  for (const mode of MODES) {
    include.push({
      app: appDef.app,
      sdk: appDef.sdk,
      'app-dir': `dev-packages/e2e-tests/test-applications/${appDef.app}`,
      mode,
      serve: appDef.serve,
      'static-dir': appDef.staticDir ?? '',
      'start-cmd': appDef.startCmd ?? '',
      'ready-pattern': appDef.readyPattern ?? 'localhost',
      'env-var-name': appDef.envVarName,
    });
  }
}

// eslint-disable-next-line no-console
console.log(`matrix=${JSON.stringify({ include })}`);
