/**
 * Generates the GitHub Actions matrix for Lighthouse CI runs.
 *
 * Outputs: `matrix=<JSON>` to stdout (consumed by $GITHUB_OUTPUT in CI).
 *
 * Matrix shape: 14 representative E2E apps × 3 Sentry feature modes = 42 cells.
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
  // Plain webpack apps — read process.env directly (no bundler prefix).
  { app: 'default-browser', sdk: 'browser', serve: 'static', staticDir: 'build', envVarName: 'SENTRY_LIGHTHOUSE_MODE' },
  { app: 'react-19', sdk: 'react', serve: 'static', staticDir: 'build', envVarName: 'SENTRY_LIGHTHOUSE_MODE' },
  { app: 'ember-classic', sdk: 'ember', serve: 'static', staticDir: 'dist', envVarName: 'SENTRY_LIGHTHOUSE_MODE' },
  {
    app: 'create-remix-app-express',
    sdk: 'remix',
    serve: 'server',
    startCmd: 'cross-env NODE_ENV=production node ./server.mjs',
    readyPattern: 'localhost',
    envVarName: 'SENTRY_LIGHTHOUSE_MODE',
  },
  {
    app: 'angular-21',
    sdk: 'angular',
    serve: 'static',
    staticDir: 'dist/angular-21',
    envVarName: 'SENTRY_LIGHTHOUSE_MODE',
  },

  // Vite-based apps with `envPrefix: 'PUBLIC_'` (matches Sentry's repo convention for PUBLIC_E2E_TEST_DSN).
  { app: 'vue-3', sdk: 'vue', serve: 'static', staticDir: 'dist', envVarName: 'PUBLIC_SENTRY_LIGHTHOUSE_MODE' },
  { app: 'svelte-5', sdk: 'svelte', serve: 'static', staticDir: 'dist', envVarName: 'PUBLIC_SENTRY_LIGHTHOUSE_MODE' },
  {
    app: 'sveltekit-2',
    sdk: 'sveltekit',
    serve: 'server',
    startCmd: 'node build',
    readyPattern: 'localhost',
    envVarName: 'PUBLIC_SENTRY_LIGHTHOUSE_MODE',
  },
  {
    app: 'astro-5',
    sdk: 'astro',
    serve: 'server',
    startCmd: 'node ./dist/server/entry.mjs',
    readyPattern: 'localhost',
    envVarName: 'PUBLIC_SENTRY_LIGHTHOUSE_MODE',
  },
  {
    app: 'react-router-7-spa',
    sdk: 'react-router',
    serve: 'static',
    staticDir: 'dist',
    envVarName: 'PUBLIC_SENTRY_LIGHTHOUSE_MODE',
  },

  // Vite-based apps using the default `VITE_` prefix (no custom envPrefix set).
  {
    app: 'solidstart-spa',
    sdk: 'solidstart',
    serve: 'static',
    staticDir: '.output/public',
    envVarName: 'VITE_SENTRY_LIGHTHOUSE_MODE',
  },
  {
    app: 'tanstackstart-react',
    sdk: 'tanstack-start',
    serve: 'server',
    startCmd: 'node --import ./.output/server/instrument.server.mjs .output/server/index.mjs',
    readyPattern: 'localhost',
    envVarName: 'VITE_SENTRY_LIGHTHOUSE_MODE',
  },

  // Next.js — only `NEXT_PUBLIC_*` env vars are exposed to client code.
  {
    app: 'nextjs-16',
    sdk: 'nextjs',
    serve: 'server',
    startCmd: 'pnpm start',
    readyPattern: 'Ready in',
    envVarName: 'NEXT_PUBLIC_SENTRY_LIGHTHOUSE_MODE',
  },

  // Nuxt — only `NUXT_PUBLIC_*` env vars are exposed to client code (Nuxt convention).
  {
    app: 'nuxt-5',
    sdk: 'nuxt',
    serve: 'server',
    startCmd: 'node .output/server/index.mjs',
    readyPattern: 'Listening on',
    envVarName: 'NUXT_PUBLIC_SENTRY_LIGHTHOUSE_MODE',
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
