import { createCodeTransformer } from '@apm-js-collab/code-transformer-bundler-plugins/core';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tracingChannel } from 'node:diagnostics_channel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SENTRY_INSTRUMENTATIONS } from '../../src/orchestrion/config';
import { neonChannels } from '../../src/orchestrion/config/neon';
import { orchestrionTransformOptions } from '../../src/orchestrion/bundler/options';

// The selectors key on internals of Neon's minified bundles, so this runs the bundler plugins'
// code transformer over the real published files and executes the result: a release that
// reshapes the bundle fails here rather than silently dropping spans.
const nodeRequire = createRequire(import.meta.url);
const packageDir = dirname(nodeRequire.resolve('@neondatabase/serverless'));

interface NeonModule {
  neon: (connectionString: string) => {
    (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
    query: (text: string, params?: unknown[]) => Promise<unknown>;
    transaction: (queries: Promise<unknown>[]) => Promise<unknown>;
  };
  neonConfig: { fetchFunction: unknown };
  Client: new (connectionString: string) => {
    query: (text: string) => Promise<unknown>;
    end: () => Promise<void>;
  };
}

function neonResponse(body: unknown): () => Promise<Response> {
  return () => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

const EMPTY_RESULT = { rows: [], fields: [], command: 'SELECT', rowCount: 0 };

describe('neon orchestrion config on the published bundles', () => {
  let outDir: string;
  const events: string[] = [];

  beforeAll(() => {
    outDir = mkdtempSync(join(tmpdir(), 'neon-bundle-'));
    for (const name of ['query', 'http-query', 'resolve-connection']) {
      tracingChannel(`orchestrion:@neondatabase/serverless:${name}`).subscribe({
        start: data => {
          const ctx = data as { arguments: unknown[]; self?: { connectionParameters?: { database?: string } } };
          events.push(`${name}:start:${ctx.self?.connectionParameters?.database ?? JSON.stringify(ctx.arguments[0])}`);
        },
        end: () => {},
        asyncStart: () => {},
        asyncEnd: data => {
          const ctx = data as { result?: { resolvedURL?: URL } };
          events.push(`${name}:asyncEnd:${ctx.result?.resolvedURL?.hostname ?? ''}`);
        },
        error: () => {},
      });
    }
  });

  afterAll(() => rmSync(outDir, { recursive: true, force: true }));

  it('injects the subscriber snippet for the neon integration', () => {
    const transformer = createCodeTransformer(orchestrionTransformOptions({}));
    const result = transformer.transform(
      readFileSync(join(packageDir, 'index.js'), 'utf8'),
      join(packageDir, 'index.js'),
    );

    expect(result?.code).toContain('orchestrionModuleInjected("@neondatabase/serverless", () => neonIntegration())');
  });

  it.each([
    ['index.js', 'cjs'],
    ['index.mjs', 'esm'],
  ])('instruments both drivers in %s', async (file, format) => {
    const transformer = createCodeTransformer({ instrumentations: SENTRY_INSTRUMENTATIONS });
    const source = join(packageDir, file);
    const result = transformer.transform(readFileSync(source, 'utf8'), source);
    expect(result).not.toBeNull();

    for (const channel of Object.values(neonChannels)) {
      expect(result!.code).toContain(channel);
    }

    const outFile = join(outDir, file);
    writeFileSync(outFile, result!.code);
    const mod: NeonModule =
      format === 'cjs' ? nodeRequire(outFile) : ((await import(pathToFileURL(outFile).href)) as NeonModule);

    events.length = 0;
    mod.neonConfig.fetchFunction = neonResponse(EMPTY_RESULT);
    const sql = mod.neon('postgres://user:pass@ep-x.aws.neon.tech/neondb');
    await sql.query('SELECT $1', [1]);
    await sql`SELECT 2`;
    mod.neonConfig.fetchFunction = neonResponse({ results: [EMPTY_RESULT, EMPTY_RESULT] });
    await sql.transaction([sql`SELECT 3`, sql`SELECT 4`]);

    const client = new mod.Client('postgres://user:pass@ep-x.aws.neon.tech/neondb');
    // Never connects: the channel fires at the call, before the socket is needed.
    client.query('SELECT 5').catch(() => {});
    await client.end().catch(() => {});

    const resolve = [
      'resolve-connection:start:"postgres://user:pass@ep-x.aws.neon.tech/neondb"',
      'resolve-connection:asyncEnd:ep-x.aws.neon.tech',
    ];
    expect(events).toEqual([
      'http-query:start:{"query":"SELECT $1","params":[1]}',
      ...resolve,
      'http-query:asyncEnd:',
      'http-query:start:{"strings":["SELECT 2"],"values":[]}',
      ...resolve,
      'http-query:asyncEnd:',
      'http-query:start:[{"strings":["SELECT 3"],"values":[]},{"strings":["SELECT 4"],"values":[]}]',
      ...resolve,
      'http-query:asyncEnd:',
      'query:start:neondb',
    ]);
  });
});
