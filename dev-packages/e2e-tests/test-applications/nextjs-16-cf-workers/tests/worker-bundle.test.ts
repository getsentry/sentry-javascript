import { expect, test } from '@playwright/test';
import * as fs from 'fs';
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
  const leaks = serverFiles.filter(filePath => {
    const content = fs.readFileSync(filePath, 'utf8');
    return markers.some(marker => content.includes(marker));
  });

  expect(leaks.map(filePath => path.relative(openNextDir, filePath))).toEqual([]);
});

function collectJsFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return collectJsFiles(fullPath);
    }
    return /\.(js|mjs|cjs)$/.test(entry.name) ? [fullPath] : [];
  });
}
