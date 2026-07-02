import * as fs from 'node:fs';
import * as path from 'node:path';
import { consoleSandbox } from '@sentry/core';
import { detectDeployTarget } from './detectDeployTarget';

/**
 * The strategy used to automatically inject Sentry server instrumentation into the React Router server build, so
 * users don't have to manually set `NODE_OPTIONS='--import ./instrument.server.mjs'`.
 *
 * Only `experimental_dynamic-import` is exposed: it wraps the server entry so the app is loaded via a dynamic
 * `import()` after Sentry's hooks register, enabling full (OpenTelemetry) instrumentation - equivalent to
 * `--import`. (A simpler top-level-import strategy exists internally only, as a fallback when the server build's
 * exports can't be parsed.)
 */
export type AutoInjectServerSentry = 'experimental_dynamic-import' | false;

/** Marker written into generated files so re-runs of the build are idempotent and don't double-inject. */
export const SENTRY_AUTO_INJECT_MARKER = '/* @sentry/react-router auto-injected server instrumentation */';

/** Default (relative to project root) path to the user's pre-built ESM server instrumentation file. */
export const DEFAULT_SERVER_INSTRUMENTATION_FILE = './instrument.server.mjs';

const LOG_PREFIX = '[Sentry React Router]';

interface InjectServerInstrumentationOptions {
  /** Absolute path to the project root (Vite's `config.root`). */
  root: string;
  /** Absolute path to the build directory (`reactRouterConfig.buildDirectory`). */
  buildDirectory: string;
  /** The server build file name (`reactRouterConfig.serverBuildFile`, e.g. `index.js`). */
  serverBuildFile: string;
  /** Whether SSR is enabled (`reactRouterConfig.ssr`). When `false` there is no server build to wrap. */
  ssr: boolean;
  /** Whether server bundles are in use (`reactRouterConfig.serverBundles`). Not supported by auto-injection. */
  hasServerBundles: boolean;
  /** Path (relative to root) to the user's server instrumentation file. */
  serverInstrumentationFile: string;
  debug: boolean;
}

/**
 * Parses the (bundled, ESM) React Router server build output and extracts its export names.
 *
 * The React Router server build (`build/server/index.js`) exposes a fixed `ServerBuild` shape via **named** exports
 * (`entry`, `routes`, `assets`, `basename`, `future`, `ssr`, `isSpaMode`, `prerender`, `routeDiscovery`,
 * `publicPath`, `assetsBuildDirectory`, and conditionally `unstable_getCriticalCss` / `allowedActionOrigins`).
 * Rollup may emit these either as `export const NAME` / `export function NAME` or consolidated into
 * `export { a, b as c }` statements. We parse all of these forms so the `dynamic-import` wrapper can re-export
 * exactly what the original build exposed (robust across React Router versions).
 */
export function parseServerBuildExports(code: string): { namedExports: string[]; hasDefaultExport: boolean } {
  const namedExports = new Set<string>();
  let hasDefaultExport = false;

  // 1. `export { a, b as c, d as default }` blocks
  const exportBlockRegex = /export\s*\{([^}]*)\}/g;
  let blockMatch: RegExpExecArray | null;
  while ((blockMatch = exportBlockRegex.exec(code)) !== null) {
    const specifiers = blockMatch[1]?.split(',') ?? [];
    for (const specifier of specifiers) {
      const trimmed = specifier.trim();
      if (!trimmed) {
        continue;
      }
      // `localName as exportedName` -> we care about the exported (right-hand) name
      const exportedName = trimmed.includes(' as ') ? trimmed.split(/\s+as\s+/)[1]?.trim() : trimmed;
      if (!exportedName) {
        continue;
      }
      if (exportedName === 'default') {
        hasDefaultExport = true;
      } else {
        namedExports.add(exportedName);
      }
    }
  }

  // 2. `export const|let|var|function|async function|class NAME`
  const exportDeclRegex = /export\s+(?:const|let|var|(?:async\s+)?function\*?|class)\s+([A-Za-z_$][\w$]*)/g;
  let declMatch: RegExpExecArray | null;
  while ((declMatch = exportDeclRegex.exec(code)) !== null) {
    const name = declMatch[1];
    if (name) {
      namedExports.add(name);
    }
  }

  // 3. `export default ...`
  if (/export\s+default\s/.test(code)) {
    hasDefaultExport = true;
  }

  return { namedExports: Array.from(namedExports), hasDefaultExport };
}

/**
 * Generates the `top-level-import` prefix that is prepended to the server build entry. This loads the Sentry
 * server config before the rest of the entry module body runs. Note: because the entry's other static imports are
 * already part of the module graph, this only enables limited (e.g. HTTP / framework-level) instrumentation - it
 * cannot patch already-loaded dependencies (databases etc.). For full instrumentation use `dynamic-import`.
 */
export function generateTopLevelImportPrefix(instrumentationImportPath: string): string {
  return `${SENTRY_AUTO_INJECT_MARKER}\nimport ${JSON.stringify(instrumentationImportPath)};\n`;
}

/**
 * Generates a `dynamic-import` wrapper module that replaces the server build entry. It:
 *  1. ensures Sentry is initialized exactly once (guarding against a manual `--import` of the same file),
 *  2. dynamically `import()`s the original (renamed) server build *after* Sentry's hooks are registered, so
 *     `import-in-the-middle`-based OpenTelemetry instrumentation can patch the app's dependencies, and
 *  3. re-exports the original build's `ServerBuild` bindings so `react-router-serve` keeps working unchanged.
 *
 * `react-router-serve` consumes the build via `await import(...)`, so the top-level `await`s below are safe.
 */
export function generateDynamicImportWrapper(params: {
  instrumentationImportPath: string;
  originalImportPath: string;
  namedExports: string[];
  hasDefaultExport: boolean;
}): string {
  const { instrumentationImportPath, originalImportPath, namedExports, hasDefaultExport } = params;

  const reExports = namedExports.map(name => `export const ${name} = __sentryServerBuild.${name};`).join('\n');

  const defaultReExport = hasDefaultExport ? '\nexport default __sentryServerBuild.default;' : '';

  return (
    `${SENTRY_AUTO_INJECT_MARKER}\n` +
    "import * as __sentryReactRouter from '@sentry/react-router';\n\n" +
    '// Initialize Sentry exactly once - skip if it was already initialized (e.g. via `--import`).\n' +
    'if (!__sentryReactRouter.getClient()) {\n' +
    `  await import(${JSON.stringify(instrumentationImportPath)});\n` +
    '}\n\n' +
    '// Import the original server build lazily so Sentry/OTel hooks are registered before its dependencies load.\n' +
    `const __sentryServerBuild = await import(${JSON.stringify(originalImportPath)});\n\n` +
    `${reExports}${defaultReExport}\n`
  );
}

function log(message: string, debug: boolean): void {
  if (!debug) {
    return;
  }
  consoleSandbox(() => {
    // eslint-disable-next-line no-console
    console.log(`${LOG_PREFIX} ${message}`);
  });
}

function warn(message: string): void {
  consoleSandbox(() => {
    // eslint-disable-next-line no-console
    console.warn(`${LOG_PREFIX} ${message}`);
  });
}

/**
 * Auto-injects Sentry server instrumentation into the React Router server build output, removing the need for a
 * manual `NODE_OPTIONS='--import ./instrument.server.mjs'`. Called from `sentryOnBuildEnd` after source map
 * handling, so it never interferes with debug-id injection / source map upload.
 *
 * Gracefully no-ops (with a debug log) for SPA/prerender-only builds and skips (with a warning) for deploy targets
 * that aren't supported yet.
 */
export async function injectServerInstrumentation(options: InjectServerInstrumentationOptions): Promise<void> {
  const { root, buildDirectory, serverBuildFile, ssr, hasServerBundles, serverInstrumentationFile, debug } = options;

  // SPA / prerender-only builds have no server entry to wrap.
  if (!ssr) {
    log('`ssr` is disabled (SPA mode) - skipping server instrumentation auto-injection.', debug);
    return;
  }

  if (hasServerBundles) {
    warn(
      '`autoInjectServerSentry` does not support `serverBundles` yet - skipping. ' +
        'Please set up server instrumentation manually via `NODE_OPTIONS`.',
    );
    return;
  }

  const deployTarget = detectDeployTarget(root);
  if (deployTarget === 'cloudflare') {
    log(
      'Detected a Cloudflare deploy target - skipping injection. Initialize Sentry inside your worker instead.',
      debug,
    );
    return;
  }
  if (deployTarget === 'vercel' || deployTarget === 'netlify') {
    warn(
      `Detected a "${deployTarget}" (serverless) deploy target. Automatic server instrumentation injection is ` +
        'not supported for serverless targets yet - skipping. Track this in a follow-up; for now initialize ' +
        'Sentry manually for serverless functions.',
    );
    return;
  }

  const serverEntryPath = path.resolve(buildDirectory, 'server', serverBuildFile);
  if (!fs.existsSync(serverEntryPath)) {
    warn(`Could not find server build entry at \`${serverEntryPath}\` - skipping auto-injection.`);
    return;
  }

  const instrumentationSourcePath = path.resolve(root, serverInstrumentationFile);
  if (!fs.existsSync(instrumentationSourcePath)) {
    warn(
      `Could not find server instrumentation file at \`${instrumentationSourcePath}\`. ` +
        'Create it (calling `Sentry.init`) or set the `autoInjectServerSentry` option to `false`.',
    );
    return;
  }

  const originalContent = fs.readFileSync(serverEntryPath, 'utf-8');

  // Idempotency: if we already injected (e.g. a rebuild without cleaning the output dir), do nothing.
  if (originalContent.includes(SENTRY_AUTO_INJECT_MARKER)) {
    log('Server build already instrumented - skipping.', debug);
    return;
  }

  // Copy the user's instrumentation file next to the server entry so the build output is self-contained.
  const copiedInstrumentationFileName = 'instrument.server.mjs';
  const copiedInstrumentationPath = path.resolve(buildDirectory, 'server', copiedInstrumentationFileName);
  fs.copyFileSync(instrumentationSourcePath, copiedInstrumentationPath);
  const instrumentationImportPath = `./${copiedInstrumentationFileName}`;

  // `experimental_dynamic-import`: move the original entry aside and replace it with a wrapper that re-exports it.
  const serverBuildExt = path.extname(serverBuildFile);
  const serverBuildBase = path.basename(serverBuildFile, serverBuildExt);
  const originalFileName = `${serverBuildBase}.sentry-original.mjs`;
  const originalEntryPath = path.resolve(buildDirectory, 'server', originalFileName);

  fs.writeFileSync(originalEntryPath, originalContent);

  const { namedExports, hasDefaultExport } = parseServerBuildExports(originalContent);
  if (namedExports.length === 0 && !hasDefaultExport) {
    warn(
      `Could not detect any exports in \`${serverBuildFile}\` - falling back to \`top-level-import\` to avoid ` +
        'breaking the server build.',
    );
    fs.rmSync(originalEntryPath, { force: true });
    fs.writeFileSync(serverEntryPath, generateTopLevelImportPrefix(instrumentationImportPath) + originalContent);
    return;
  }

  const wrapper = generateDynamicImportWrapper({
    instrumentationImportPath,
    originalImportPath: `./${originalFileName}`,
    namedExports,
    hasDefaultExport,
  });
  fs.writeFileSync(serverEntryPath, wrapper);

  log(
    `Wrapped \`${serverBuildFile}\` with a dynamic \`import()\` (original moved to \`${originalFileName}\`) so ` +
      'Sentry is preloaded before the server initializes.',
    debug,
  );
}
