import { rolldown as rolldown112 } from 'rolldown';
import { rolldown as rolldown123 } from 'rolldown-1-2';
import { describe, expect, it } from 'vitest';
import { sentryRollupPlugin } from '../../src/rollup';

const virtualModules: Record<string, string> = {
  'virtual:app': `export async function loadShared() { return import('virtual:shared'); }`,
  'virtual:shared': `export const shared = 'shared';`,
  'virtual:unrelated': `console.log('unrelated');`,
};

type RolldownVersion = '1.1.2' | '1.2.5';
type SourceMapMode = boolean | 'inline' | 'hidden';
type OutputFormat = 'esm' | 'cjs';

const outputCases: [OutputFormat, SourceMapMode][] = [
  ['esm', true],
  ['esm', false],
  ['esm', 'inline'],
  ['esm', 'hidden'],
  ['cjs', true],
  ['cjs', false],
  ['cjs', 'inline'],
  ['cjs', 'hidden'],
];

async function createBuild(version: RolldownVersion, includeUnrelatedEntry: boolean) {
  const input: Record<string, string> = includeUnrelatedEntry
    ? { unrelated: 'virtual:unrelated', app: 'virtual:app' }
    : { app: 'virtual:app' };
  const options = {
    input,
    plugins: [
      {
        name: 'virtual-modules',
        resolveId(id: string) {
          return id in virtualModules ? id : null;
        },
        load(id: string) {
          return virtualModules[id] ?? null;
        },
      },
      ...sentryRollupPlugin({
        release: { inject: false },
        sourcemaps: { disable: 'disable-upload' },
        telemetry: false,
      }),
    ],
  };

  return version === '1.1.2' ? rolldown112(options) : rolldown123(options);
}

async function build(
  version: RolldownVersion,
  includeUnrelatedEntry: boolean,
  sourcemap: SourceMapMode = true,
  format: OutputFormat = 'esm',
) {
  const bundle = await createBuild(version, includeUnrelatedEntry);

  try {
    const { output } = await bundle.generate({
      format,
      sourcemap,
      entryFileNames: '[name]-[hash].js',
      chunkFileNames: '[name]-[hash].js',
    });

    return output.filter(outputFile => outputFile.type === 'chunk');
  } finally {
    await bundle.close();
  }
}

function expectFinalizedDebugId(code: string): void {
  expect(code).not.toContain('SENTRY_DEBUG_ID_PLACEHOLDER_00000000');
  const debugIds = code.match(/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}/g);
  expect(debugIds).toHaveLength(2);
  expect(new Set(debugIds)).toHaveLength(1);
}

describe.each(['1.1.2', '1.2.5'] satisfies RolldownVersion[])('Rolldown %s debug ID determinism', version => {
  it.each(outputCases)(
    'produces identical %s chunks in repeated builds with sourcemap=%s',
    async (format, sourcemap) => {
      const firstBuild = await build(version, false, sourcemap, format);
      const secondBuild = await build(version, false, sourcemap, format);

      const comparableOutput = (chunks: typeof firstBuild) =>
        chunks.map(chunk => ({
          fileName: chunk.fileName,
          code: chunk.code,
          map: chunk.map?.toString(),
        }));
      expect(comparableOutput(secondBuild)).toEqual(comparableOutput(firstBuild));
      for (const chunk of firstBuild) {
        expectFinalizedDebugId(chunk.code);
      }
    },
  );

  it('keeps existing chunks stable when an unrelated entry changes placeholder allocation', async () => {
    const firstBuild = await build(version, false);
    const secondBuild = await build(version, true);

    for (const facadeModuleId of ['virtual:app', 'virtual:shared']) {
      const firstChunk = firstBuild.find(chunk => chunk.facadeModuleId === facadeModuleId);
      const secondChunk = secondBuild.find(chunk => chunk.facadeModuleId === facadeModuleId);

      expect(firstChunk).toBeDefined();
      expect(secondChunk).toBeDefined();
      expect(secondChunk?.fileName).toBe(firstChunk?.fileName);
      expect(secondChunk?.code).toBe(firstChunk?.code);
      expectFinalizedDebugId(firstChunk?.code ?? '');
    }
  });
});
