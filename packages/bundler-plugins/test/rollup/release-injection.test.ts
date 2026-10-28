import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { rollup } from 'rollup';
import { rolldown } from 'rolldown';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { sentryRollupPlugin } from '../../src/rollup';
import { sentryVitePlugin } from '../../src/vite';

const RELEASE_SNIPPET = /SENTRY_RELEASE\s*=\s*\{\s*id:\s*"1\.2\.3"\s*\}/;
const DEBUG_ID_MARKER = /sentry-dbid-[0-9a-f-]{36}/;

function readChunks(outDir: string): Record<string, string> {
  const chunks: Record<string, string> = {};
  for (const fileName of fs.readdirSync(outDir)) {
    if (fileName.endsWith('.js')) {
      chunks[fileName] = fs.readFileSync(path.join(outDir, fileName), 'utf8');
    }
  }
  return chunks;
}

function findChunk(chunks: Record<string, string>, content: string): string {
  const match = Object.entries(chunks).find(([, code]) => code.includes(content));
  expect(match, `no chunk contains ${content}`).toBeDefined();
  return match?.[1] ?? '';
}

describe('release injection', () => {
  let tmpDir: string;
  let entries: string[];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-rollup-release-injection-'));
    entries = [path.join(tmpDir, 'entry.js'), path.join(tmpDir, 'second.js')];
    fs.writeFileSync(
      entries[0] ?? '',
      'import { shared } from "./shared.js";\nconsole.log("entry", shared);\nimport("./route.js");\n',
    );
    fs.writeFileSync(entries[1] ?? '', 'import { shared } from "./shared.js";\nconsole.log("second", shared);\n');
    fs.writeFileSync(path.join(tmpDir, 'shared.js'), 'export const shared = "shared";\nconsole.log(shared);\n');
    fs.writeFileSync(
      path.join(tmpDir, 'route.js'),
      'import { shared } from "./shared.js";\nconsole.log("route", shared);\n',
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('injects the release only into chunks that load at startup (rollup)', async () => {
    const outDir = path.join(tmpDir, 'dist');
    const build = await rollup({
      input: entries,
      plugins: [sentryRollupPlugin({ telemetry: false, release: { name: '1.2.3', create: false } })],
    });
    await build.write({ dir: outDir, chunkFileNames: '[name].js' });

    const chunks = readChunks(outDir);
    expect(Object.keys(chunks)).toHaveLength(4);

    const entryChunk = findChunk(chunks, '"entry"');
    const secondChunk = findChunk(chunks, '"second"');
    const sharedChunk = findChunk(chunks, '"shared"');
    const routeChunk = findChunk(chunks, '"route"');

    expect(entryChunk).toMatch(RELEASE_SNIPPET);
    expect(secondChunk).toMatch(RELEASE_SNIPPET);
    expect(sharedChunk).toMatch(RELEASE_SNIPPET);
    expect(routeChunk).not.toMatch(RELEASE_SNIPPET);

    expect(entryChunk).toMatch(DEBUG_ID_MARKER);
    expect(sharedChunk).toMatch(DEBUG_ID_MARKER);
    expect(routeChunk).toMatch(DEBUG_ID_MARKER);
  });

  it('injects the release only into chunks that load at startup (rolldown / vite)', async () => {
    const outDir = path.join(tmpDir, 'dist');
    const build = await rolldown({
      input: entries,
      plugins: sentryVitePlugin({ telemetry: false, release: { name: '1.2.3', create: false } }),
    });
    await build.write({ dir: outDir, chunkFileNames: '[name].js' });

    const chunks = readChunks(outDir);
    expect(Object.keys(chunks)).toHaveLength(4);

    const entryChunk = findChunk(chunks, '"entry"');
    const secondChunk = findChunk(chunks, '"second"');
    const sharedChunk = findChunk(chunks, '"shared"');
    const routeChunk = findChunk(chunks, '"route"');

    expect(entryChunk).toMatch(RELEASE_SNIPPET);
    expect(secondChunk).toMatch(RELEASE_SNIPPET);
    expect(sharedChunk).toMatch(RELEASE_SNIPPET);
    expect(routeChunk).not.toMatch(RELEASE_SNIPPET);

    expect(entryChunk).toMatch(DEBUG_ID_MARKER);
    expect(sharedChunk).toMatch(DEBUG_ID_MARKER);
    expect(routeChunk).toMatch(DEBUG_ID_MARKER);
  });
});
