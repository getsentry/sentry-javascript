#!/usr/bin/env node
/* eslint-disable no-console */
// Emits a Remix 3 app's browser module graph to a directory and uploads it to Sentry.
//
// Must run under the Sentry entry, which provides Remix's TypeScript loader and patches the asset
// server so the emitted modules carry debug IDs:
//
//   node --import @sentry/remix/v3/node ./node_modules/.bin/sentry-remix-v3-upload-sourcemaps \
//     --entry app/actions/public/entry.ts --release "$RELEASE"
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

class UsageError extends Error {}

let outDir;
let keepOutput = false;

try {
  const values = parseOptions();
  keepOutput = Boolean(values['keep-output'] || values['out-dir']);
  const org = values.org ?? process.env.SENTRY_ORG;
  const project = values.project ?? process.env.SENTRY_PROJECT;
  if (!values['dry-run'] && !project) {
    fail('a project is required for the upload. Pass `--project` or set `SENTRY_PROJECT` as environment variable.');
  }

  const { emitAssets } = await import('@sentry/remix/v3');

  let assetsModule;
  try {
    assetsModule = await import(pathToFileURL(path.resolve(values['assets-module'])).href);
  } catch (error) {
    if (error?.code === 'ERR_UNKNOWN_FILE_EXTENSION') {
      fail(`could not load ${values['assets-module']}. Run this command with \`node --import @sentry/remix/v3/node\`.`);
    }
    throw error;
  }
  const assets = assetsModule[values['assets-export']];
  if (typeof assets?.getPreloads !== 'function' || typeof assets?.fetch !== 'function') {
    fail(`${values['assets-module']} does not export an asset server named "${values['assets-export']}"`);
  }

  outDir = values['out-dir'] ?? fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-remix-v3-assets-'));
  const emitted = await emitAssets({ assets, entries: values.entry, outDir });
  const maps = emitted.filter(asset => asset.mapFile).length;
  const debugIds = emitted.filter(asset => asset.debugId).length;
  console.log(
    `[sentry] emitted ${emitted.length} modules, ${maps} source maps, ${debugIds} debug IDs${keepOutput ? ` to ${outDir}` : ''}`,
  );

  if (emitted.length > 0 && debugIds === 0) {
    // The one failure that is otherwise silent: an unpatched asset server emits plain modules.
    fail(
      'no debug IDs were emitted. Run this command with `node --import @sentry/remix/v3/node` so the asset server is instrumented.',
    );
  }
  if (debugIds < emitted.length || maps < emitted.length) {
    // A warning, not a failure: `sourceMaps: false` yields no maps on purpose.
    console.warn(
      `[sentry] ${emitted.length - debugIds} modules without a debug ID and ${emitted.length - maps} without a source map; those will not symbolicate.`,
    );
  }

  if (values['dry-run']) {
    console.log('[sentry] --dry-run, skipping upload');
  } else {
    const { createSentrySDK } = await import('sentry');
    const sentry = createSentrySDK({ url: values.url, org, project });
    const release = values.release ?? (await sentry.release['propose-version']()).version;
    try {
      // The project has to be named here; the SDK default does not reach release creation.
      await sentry.release.create({ orgVersion: release, project });
      // Modules keep their served names (`.ts`, `.tsx`), which the upload skips by default. Only module
      // extensions go here: the upload pairs each module with the `.map` sibling `emitAssets` wrote.
      const ext = [...new Set(emitted.map(asset => path.extname(asset.file)))].join(',');
      await sentry.sourcemap.upload({ directory: outDir, release, ext });
      await sentry.release.finalize({ orgVersion: release });
    } catch (error) {
      fail(error?.message ?? String(error));
    }
    console.log(`[sentry] uploaded release ${release}`);
  }
} catch (error) {
  if (!(error instanceof UsageError)) {
    throw error;
  }
  console.error(`[sentry] ${error.message}`);
  process.exitCode = 1;
} finally {
  if (outDir && !keepOutput) {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
}

function parseOptions() {
  let values;
  try {
    ({ values } = parseArgs({
      options: {
        entry: { type: 'string', multiple: true },
        'assets-module': { type: 'string', default: './app/assets.ts' },
        'assets-export': { type: 'string', default: 'assets' },
        release: { type: 'string' },
        org: { type: 'string' },
        project: { type: 'string' },
        url: { type: 'string' },
        'out-dir': { type: 'string' },
        'keep-output': { type: 'boolean', default: false },
        'dry-run': { type: 'boolean', default: false },
      },
    }));
  } catch (error) {
    fail(error.message);
  }
  if (!values.entry?.length) {
    fail('at least one --entry is required, e.g. --entry app/actions/public/entry.ts');
  }
  return values;
}

function fail(message) {
  throw new UsageError(message);
}
