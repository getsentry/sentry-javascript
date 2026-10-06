import { expect, test } from '@playwright/test';
import * as fs from 'fs';
import { createRequire } from 'module';
import * as path from 'path';
import { isDevMode } from './isDevMode';

/**
 * The orchestrion bundler plugins are build-time-only, and their module-scope side effects break
 * on Workers (an unawaited `WebAssembly.compile()` crashed every cold start, issue #22794). The
 * worker bundle OpenNext produces must therefore never contain them: importing `@sentry/nextjs`
 * on the server has to keep the plugin graph out of the deployed artifact.
 */
test('worker bundle does not contain the orchestrion bundler plugins', () => {
  test.skip(isDevMode, 'requires the production worker build');

  const openNextDir = path.resolve(__dirname, '..', '.open-next');
  expect(fs.existsSync(path.join(openNextDir, 'worker.js'))).toBe(true);

  // `assets` holds the static client files; everything else is code the worker can run.
  const serverFiles = collectJsFiles(openNextDir).filter(
    filePath => !filePath.startsWith(path.join(openNextDir, 'assets')),
  );
  expect(serverFiles.length).toBeGreaterThan(0);

  const markers = ['code-transformer-bundler-plugins', '__codeTransformerWebpackDiagnostics'];

  // The markers must still exist in the installed plugin build.
  // If upstream renames them, this fails instead of letting the leak check below pass.
  const pluginGraphSources = readOrchestrionPluginGraphSources();
  for (const marker of markers) {
    expect(
      pluginGraphSources.some(source => source.includes(marker)),
      `marker "${marker}" is gone from the @sentry/server-utils plugin build — update the markers`,
    ).toBe(true);
  }

  const leaks = serverFiles.filter(filePath => {
    const content = fs.readFileSync(filePath, 'utf8');
    return markers.some(marker => content.includes(marker));
  });

  expect(leaks.map(filePath => path.relative(openNextDir, filePath))).toEqual([]);
});

/**
 * Reads the source of the installed `@sentry/server-utils` webpack plugin entry plus the files it
 * requires relatively — the graph a leak would drag into the worker bundle. `createRequire` takes
 * the `require` export condition, so this resolves the CJS build, whose `require('./…')` calls the
 * regex below picks up.
 */
function readOrchestrionPluginGraphSources(): string[] {
  const pluginEntry = createRequire(__filename).resolve('@sentry/server-utils/orchestrion/webpack');
  const entrySource = fs.readFileSync(pluginEntry, 'utf8');
  return [
    entrySource,
    ...[...entrySource.matchAll(/require\('(\.\.?\/[^']+)'\)/g)].map(([, specifier]) =>
      fs.readFileSync(path.resolve(path.dirname(pluginEntry), specifier), 'utf8'),
    ),
  ];
}

function collectJsFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return collectJsFiles(fullPath);
    }
    return /\.(js|mjs|cjs)$/.test(entry.name) ? [fullPath] : [];
  });
}
