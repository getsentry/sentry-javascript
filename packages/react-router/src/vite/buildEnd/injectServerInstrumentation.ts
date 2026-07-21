import * as fs from 'node:fs';
import * as path from 'node:path';
import { consoleSandbox } from '@sentry/core';
import { detectCloudflareTarget } from './detectDeployTarget';

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
  /**
   * The server build output format (`reactRouterConfig.serverModuleFormat`, `'esm'` or `'cjs'`). We only inject the
   * ESM `import` prefix into ESM builds; CJS builds are skipped with a warning.
   */
  serverModuleFormat: 'esm' | 'cjs';
  /** Whether SSR is enabled (`reactRouterConfig.ssr`). When `false` there is no server build to wrap. */
  ssr: boolean;
  /** Whether server bundles are in use (`reactRouterConfig.serverBundles`). Not supported by auto-injection. */
  hasServerBundles: boolean;
  /** Path (relative to root) to the user's server instrumentation file. */
  serverInstrumentationFile: string;
  debug: boolean;
}

/**
 * Generates the top-level import prefix that is prepended to the server build entry. This loads the Sentry server
 * config before the rest of the entry module body runs.
 *
 * With orchestrion (diagnostics-channel) instrumentation, a top-level import is sufficient: instrumented libraries
 * are patched as they are loaded, so there is no need to defer the entry behind a dynamic `import()`.
 */
export function generateTopLevelImportPrefix(instrumentationImportPath: string): string {
  return `${SENTRY_AUTO_INJECT_MARKER}\nimport ${JSON.stringify(instrumentationImportPath)};\n`;
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
  const {
    root,
    buildDirectory,
    serverBuildFile,
    serverModuleFormat,
    ssr,
    hasServerBundles,
    serverInstrumentationFile,
    debug,
  } = options;

  // SPA / prerender-only builds have no server entry to wrap.
  if (!ssr) {
    log('`ssr` is disabled (SPA mode) - skipping server instrumentation auto-injection.', debug);
    return;
  }

  // We prepend an ESM `import`, which is invalid in a CJS server build and would crash the server at startup.
  if (serverModuleFormat === 'cjs') {
    warn(
      '`autoInjectServerInstrumentation` only supports ESM server builds (`serverModuleFormat: "esm"`) - skipping. ' +
        'Please import your server instrumentation file manually at the top of your server entry instead.',
    );
    return;
  }

  if (hasServerBundles) {
    warn(
      '`autoInjectServerInstrumentation` does not support `serverBundles` yet - skipping. ' +
        'Please import your server instrumentation file manually at the top of your server entry instead.',
    );
    return;
  }

  if (detectCloudflareTarget(root)) {
    log(
      'Detected a Cloudflare deploy target - skipping injection. Initialize Sentry inside your worker instead.',
      debug,
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
        'Create it (calling `Sentry.init`) or set the `autoInjectServerInstrumentation` option to `false`.',
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

  fs.writeFileSync(serverEntryPath, generateTopLevelImportPrefix(instrumentationImportPath) + originalContent);

  log(
    `Prepended a top-level import of \`${instrumentationImportPath}\` to \`${serverBuildFile}\` so Sentry is ` +
      'initialized before the server starts.',
    debug,
  );
}
