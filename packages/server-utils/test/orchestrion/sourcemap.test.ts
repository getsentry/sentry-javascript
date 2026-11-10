import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build, type Plugin, type Rollup } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { InstrumentationConfig } from '../../src/orchestrion/apmTypes';
import { sentryOrchestrionPlugin as sentryOrchestrionRollupPlugin } from '../../src/orchestrion/bundler/rollup';
import { sentryOrchestrionPlugin as sentryOrchestrionVitePlugin } from '../../src/orchestrion/bundler/vite';

const instrumentations: InstrumentationConfig[] = [
  {
    channelName: 'query',
    module: { name: 'fake-db', versionRange: '>=1.0.0', filePath: 'index.js' },
    functionQuery: { expressionName: 'query', kind: 'Sync' },
  },
];

describe('orchestrion bundler plugins source maps', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'orchestrion-sourcemap-'));
    const packageDir = join(root, 'node_modules', 'fake-db');
    mkdirSync(packageDir, { recursive: true });
    writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ name: 'fake-db', version: '1.0.0' }));
    writeFileSync(join(packageDir, 'index.js'), 'exports.query = function query(sql) {\n  return sql;\n};\n');
    writeFileSync(
      join(root, 'server.js'),
      "import { query } from 'fake-db';\nexport const run = () => query('SELECT 1');\n",
    );
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  // https://github.com/getsentry/sentry-javascript/issues/25329
  it.each([
    ['vite', () => sentryOrchestrionVitePlugin({ instrumentations })],
    ['rollup', () => sentryOrchestrionRollupPlugin({ instrumentations }) as Plugin],
  ])('maps the transformed module only to its file in node_modules (%s plugin)', async (_name, createPlugin) => {
    const output = (await build({
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: [createPlugin()],
      ssr: { noExternal: ['fake-db'] },
      build: {
        ssr: 'server.js',
        sourcemap: true,
        write: false,
        rollupOptions: { external: ['@sentry/server-utils'] },
      },
    })) as Rollup.RollupOutput;

    const chunk = output.output[0];

    expect(chunk.code).toContain('orchestrion:fake-db:query');
    expect(chunk.map?.sources).toEqual(['../node_modules/fake-db/index.js', '../server.js']);
  });
});
