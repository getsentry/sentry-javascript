import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { InstrumentationConfig } from '../../src/orchestrion/apmTypes';
import { sentryOrchestrionPlugin } from '../../src/orchestrion/bundler/vite';

const instrumentations: InstrumentationConfig[] = [
  {
    channelName: 'query',
    module: { name: 'fake-db', versionRange: '>=1.0.0', filePath: 'index.js' },
    functionQuery: { functionName: 'query', kind: 'Sync' },
  },
];

describe('sentryOrchestrionPlugin (vite) in the Rolldown dependency optimizer', () => {
  let root: string;
  let server: ViteDevServer;

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'orchestrion-dep-optimizer-'));
    const packageDir = join(root, 'node_modules', 'fake-db');
    mkdirSync(packageDir, { recursive: true });
    writeFileSync(
      join(packageDir, 'package.json'),
      JSON.stringify({ name: 'fake-db', version: '1.0.0', type: 'module' }),
    );
    writeFileSync(join(packageDir, 'index.js'), 'export function query(sql) {\n  return sql;\n}\n');

    server = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: [sentryOrchestrionPlugin({ instrumentations, transformOptimizedDeps: true })],
      server: { middlewareMode: true, ws: false, watch: null },
      environments: {
        ssr: {
          optimizeDeps: { include: ['fake-db'], rolldownOptions: { external: ['@sentry/server-utils'] } },
        },
      },
    });
    await server.environments.ssr.depsOptimizer?.init();
  });

  afterAll(async () => {
    await server.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('transforms a pre-bundled dependency and maps it only to its file in node_modules', () => {
    const file = server.environments.ssr.depsOptimizer?.metadata.optimized['fake-db']?.file;
    expect(file).toBeDefined();

    expect(readFileSync(file!, 'utf8')).toContain('orchestrion:fake-db:query');
    const map = JSON.parse(readFileSync(`${file}.map`, 'utf8')) as { sources: string[] };
    // `node_modules/.vite/deps_ssr/fake-db.js` -> `node_modules/fake-db/index.js`
    expect(map.sources).toEqual(['../../fake-db/index.js']);
  });
});
