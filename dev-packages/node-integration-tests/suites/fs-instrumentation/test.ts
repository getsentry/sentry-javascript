import type { SerializedStreamedSpanContainer } from '@sentry/core';
import { SENTRY_OP, SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import { join } from 'path';
import { afterAll, describe, expect } from 'vitest';
import { supports } from '../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../utils/runner';

type FileSpan = Pick<SerializedStreamedSpanContainer['items'][number], 'name' | 'status' | 'attributes'>;

function expectFileSpans(
  segmentName: string,
  expected: FileSpan[],
): (container: SerializedStreamedSpanContainer) => void {
  return container => {
    const spans = container.items;
    const segment = spans.find(span => span.is_segment && span.name === segmentName);
    expect(segment).toBeDefined();

    const fileSpans = spans.filter(
      span => span.attributes[SENTRY_OP]?.value === 'file' && span.trace_id === segment!.trace_id,
    );
    expect(
      fileSpans.map(({ name, status, attributes }) => ({
        name,
        status,
        attributes: Object.fromEntries(
          Object.entries(attributes).filter(
            ([key]) => key.endsWith('_argument') || key === 'error.type' || key === SENTRY_OP || key === SENTRY_ORIGIN,
          ),
        ),
      })),
    ).toEqual(expect.arrayContaining(expected));
  };
}

describe('fs instrumentation', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  describe('records file paths and error messages', () => {
    createEsmAndCjsTests(
      __dirname,
      'scenario.mjs',
      'instrument.mjs',
      (createTestRunner, test, mode, cwd) => {
        const createRunner = (): ReturnType<typeof createTestRunner> =>
          createTestRunner().withEnv({ FIXTURES_DIR: join(cwd, 'fixtures') });
        // On Bun and Deno the ESM `node:fs` exports are not tied to the `fs` object we patch, so only `fs.promises` is traced there.
        const testUnlessNonNodeEsm = test.runIf(mode === 'cjs' || supports({ runtimes: ['node'] }));

        let scenario: ReturnType<typeof runScenario> | undefined;
        async function runScenario() {
          const paths = [
            '/readFile-error',
            '/mkdtemp',
            ...(mode === 'cjs' || supports({ runtimes: ['node'] })
              ? ['/readFile', '/copyFile', '/link', '/symlink', '/exists']
              : []),
            ...(mode === 'esm' && supports({ runtimes: ['node'] }) ? ['/named-imports'] : []),
          ];
          const runner = createRunner();
          const collectors = paths.map(path => [path, runner.collectStreamedSpansUntilSegment(`GET ${path}`)] as const);
          const results = new Map<string, unknown>();
          const started = runner.start();
          for (const path of paths) {
            results.set(path, await started.makeRequest('get', path));
          }
          await started.completed();
          return new Map(
            await Promise.all(
              collectors.map(
                async ([path, spans]) =>
                  [path, { result: results.get(path), container: { items: await spans } }] as const,
              ),
            ),
          );
        }
        async function getScenario(path: string) {
          scenario ??= runScenario();
          return (await scenario).get(path)!;
        }

        test('should create spans for fs operations that take target argument', async () => {
          const { result, container } = await getScenario('/readFile-error');
          expectFileSpans('GET /readFile-error', [
            {
              name: 'fs.readFile',
              status: 'error',
              attributes: {
                'error.type': { type: 'string', value: 'ENOENT' },
                path_argument: {
                  type: 'string',
                  value: expect.stringMatching('/fixtures/some-file-that-doesnt-exist.txt'),
                },
                [SENTRY_OP]: { type: 'string', value: 'file' },
                [SENTRY_ORIGIN]: { type: 'string', value: 'auto.file.fs' },
              },
            },
          ])(container);

          expect(result).toEqual('done');
        });

        testUnlessNonNodeEsm('should create spans for fs operations that take one path', async () => {
          const { result, container } = await getScenario('/readFile');
          expectFileSpans('GET /readFile', [
            {
              name: 'fs.readFile',
              status: 'ok',
              attributes: {
                path_argument: { type: 'string', value: expect.stringMatching('/fixtures/some-file.txt') },
                [SENTRY_OP]: { type: 'string', value: 'file' },
                [SENTRY_ORIGIN]: { type: 'string', value: 'auto.file.fs' },
              },
            },
            {
              name: 'fs.readFile',
              status: 'ok',
              attributes: {
                path_argument: { type: 'string', value: expect.stringMatching('/fixtures/some-file-promises.txt') },
                [SENTRY_OP]: { type: 'string', value: 'file' },
                [SENTRY_ORIGIN]: { type: 'string', value: 'auto.file.fs' },
              },
            },
            {
              name: 'fs.readFile',
              status: 'ok',
              attributes: {
                path_argument: {
                  type: 'string',
                  value: expect.stringMatching('/fixtures/some-file-promisify.txt'),
                },
                [SENTRY_OP]: { type: 'string', value: 'file' },
                [SENTRY_ORIGIN]: { type: 'string', value: 'auto.file.fs' },
              },
            },
          ])(container);

          expect(result).toEqual('done');
        });

        // CJS destructuring copies the functions at require time, before the instrumentation patches them.
        test.runIf(mode === 'esm' && supports({ runtimes: ['node'] }))(
          'should create spans for named imports from fs and fs/promises',
          async () => {
            const { result, container } = await getScenario('/named-imports');
            expectFileSpans('GET /named-imports', [
              {
                name: 'fs.readFileSync',
                status: 'ok',
                attributes: {
                  path_argument: { type: 'string', value: expect.stringMatching('/fixtures/some-file.txt') },
                  [SENTRY_OP]: { type: 'string', value: 'file' },
                  [SENTRY_ORIGIN]: { type: 'string', value: 'auto.file.fs' },
                },
              },
              {
                name: 'fs.readFile',
                status: 'ok',
                attributes: {
                  path_argument: {
                    type: 'string',
                    value: expect.stringMatching('/fixtures/some-file-promises.txt'),
                  },
                  [SENTRY_OP]: { type: 'string', value: 'file' },
                  [SENTRY_ORIGIN]: { type: 'string', value: 'auto.file.fs' },
                },
              },
            ])(container);

            expect(result).toEqual('done');
          },
        );

        testUnlessNonNodeEsm('should create spans for fs operations that take src and dest arguments', async () => {
          const { result, container } = await getScenario('/copyFile');
          expectFileSpans('GET /copyFile', [
            {
              name: 'fs.copyFile',
              status: 'ok',
              attributes: {
                src_argument: { type: 'string', value: expect.stringMatching('/fixtures/some-file.txt') },
                dest_argument: { type: 'string', value: expect.stringMatching('/fixtures/some-file.txt.copy') },
                [SENTRY_OP]: { type: 'string', value: 'file' },
                [SENTRY_ORIGIN]: { type: 'string', value: 'auto.file.fs' },
              },
            },
            {
              name: 'fs.copyFile',
              status: 'ok',
              attributes: {
                src_argument: { type: 'string', value: expect.stringMatching('/fixtures/some-file-promises.txt') },
                dest_argument: {
                  type: 'string',
                  value: expect.stringMatching('/fixtures/some-file-promises.txt.copy'),
                },
                [SENTRY_OP]: { type: 'string', value: 'file' },
                [SENTRY_ORIGIN]: { type: 'string', value: 'auto.file.fs' },
              },
            },
            {
              name: 'fs.copyFile',
              status: 'ok',
              attributes: {
                src_argument: { type: 'string', value: expect.stringMatching('/fixtures/some-file-promisify.txt') },
                dest_argument: {
                  type: 'string',
                  value: expect.stringMatching('/fixtures/some-file-promisify.txt.copy'),
                },
                [SENTRY_OP]: { type: 'string', value: 'file' },
                [SENTRY_ORIGIN]: { type: 'string', value: 'auto.file.fs' },
              },
            },
          ])(container);

          expect(result).toEqual('done');
        });

        testUnlessNonNodeEsm(
          'should create spans for fs operations that take existing path and new path arguments',
          async () => {
            const { result, container } = await getScenario('/link');
            expectFileSpans('GET /link', [
              {
                name: 'fs.link',
                status: 'ok',
                attributes: {
                  existing_path_argument: {
                    type: 'string',
                    value: expect.stringMatching('/fixtures/some-file.txt'),
                  },
                  new_path_argument: {
                    type: 'string',
                    value: expect.stringMatching('/fixtures/some-file.txt.link'),
                  },
                  [SENTRY_OP]: { type: 'string', value: 'file' },
                  [SENTRY_ORIGIN]: { type: 'string', value: 'auto.file.fs' },
                },
              },
              {
                name: 'fs.link',
                status: 'ok',
                attributes: {
                  existing_path_argument: {
                    type: 'string',
                    value: expect.stringMatching('/some-file-promises.txt'),
                  },
                  new_path_argument: {
                    type: 'string',
                    value: expect.stringMatching('/some-file-promises.txt.link'),
                  },
                  [SENTRY_OP]: { type: 'string', value: 'file' },
                  [SENTRY_ORIGIN]: { type: 'string', value: 'auto.file.fs' },
                },
              },
              {
                name: 'fs.link',
                status: 'ok',
                attributes: {
                  existing_path_argument: {
                    type: 'string',
                    value: expect.stringMatching('/fixtures/some-file-promisify.txt'),
                  },
                  new_path_argument: {
                    type: 'string',
                    value: expect.stringMatching('/fixtures/some-file-promisify.txt.link'),
                  },
                  [SENTRY_OP]: { type: 'string', value: 'file' },
                  [SENTRY_ORIGIN]: { type: 'string', value: 'auto.file.fs' },
                },
              },
            ])(container);

            expect(result).toEqual('done');
          },
        );

        test('should create spans for fs operations that take prefix argument', async () => {
          const { result, container } = await getScenario('/mkdtemp');
          expectFileSpans('GET /mkdtemp', [
            {
              name: 'fs.mkdtemp',
              status: 'ok',
              attributes: {
                prefix_argument: { type: 'string', value: expect.stringMatching('/foo-') },
                [SENTRY_OP]: { type: 'string', value: 'file' },
                [SENTRY_ORIGIN]: { type: 'string', value: 'auto.file.fs' },
              },
            },
            {
              name: 'fs.mkdtemp',
              status: 'ok',
              attributes: {
                prefix_argument: { type: 'string', value: expect.stringMatching('/foo-') },
                [SENTRY_OP]: { type: 'string', value: 'file' },
                [SENTRY_ORIGIN]: { type: 'string', value: 'auto.file.fs' },
              },
            },
            {
              name: 'fs.mkdtemp',
              status: 'ok',
              attributes: {
                prefix_argument: { type: 'string', value: expect.stringMatching('/foo-') },
                [SENTRY_OP]: { type: 'string', value: 'file' },
                [SENTRY_ORIGIN]: { type: 'string', value: 'auto.file.fs' },
              },
            },
          ])(container);

          expect(result).toEqual('done');
        });

        testUnlessNonNodeEsm('should create spans for fs symlink operations that take target argument', async () => {
          const { result, container } = await getScenario('/symlink');
          expectFileSpans('GET /symlink', [
            {
              name: 'fs.symlink',
              status: 'ok',
              attributes: {
                target_argument: { type: 'string', value: expect.stringMatching('/some-file-promisify.txt') },
                path_argument: { type: 'string', value: expect.stringMatching('/some-file-promisify.txt.symlink') },
                [SENTRY_OP]: { type: 'string', value: 'file' },
                [SENTRY_ORIGIN]: { type: 'string', value: 'auto.file.fs' },
              },
            },
            {
              name: 'fs.symlink',
              status: 'ok',
              attributes: {
                target_argument: {
                  type: 'string',
                  value: expect.stringMatching('/fixtures/some-file-promisify.txt'),
                },
                path_argument: {
                  type: 'string',
                  value: expect.stringMatching('/fixtures/some-file-promisify.txt.symlink'),
                },
                [SENTRY_OP]: { type: 'string', value: 'file' },
                [SENTRY_ORIGIN]: { type: 'string', value: 'auto.file.fs' },
              },
            },
            {
              name: 'fs.symlink',
              status: 'ok',
              attributes: {
                target_argument: {
                  type: 'string',
                  value: expect.stringMatching('/fixtures/some-file-promisify.txt'),
                },
                path_argument: {
                  type: 'string',
                  value: expect.stringMatching('/fixtures/some-file-promisify.txt.symlink'),
                },
                [SENTRY_OP]: { type: 'string', value: 'file' },
                [SENTRY_ORIGIN]: { type: 'string', value: 'auto.file.fs' },
              },
            },
          ])(container);

          expect(result).toEqual('done');
        });

        testUnlessNonNodeEsm('should create spans for fs.exists callback and promisified versions', async () => {
          const { result, container } = await getScenario('/exists');
          expectFileSpans('GET /exists', [
            {
              name: 'fs.exists',
              status: 'ok',
              attributes: {
                path_argument: { type: 'string', value: expect.stringMatching('/fixtures/some-file.txt') },
                [SENTRY_OP]: { type: 'string', value: 'file' },
                [SENTRY_ORIGIN]: { type: 'string', value: 'auto.file.fs' },
              },
            },
            {
              name: 'fs.exists',
              status: 'ok',
              attributes: {
                path_argument: {
                  type: 'string',
                  value: expect.stringMatching('/fixtures/some-file-promisify.txt'),
                },
                [SENTRY_OP]: { type: 'string', value: 'file' },
                [SENTRY_ORIGIN]: { type: 'string', value: 'auto.file.fs' },
              },
            },
          ])(container);

          expect(result).toEqual('done');
        });
      },
      { copyPaths: ['fixtures'] },
    );
  });

  describe('records file paths only', () => {
    createEsmAndCjsTests(
      __dirname,
      'scenario.mjs',
      'instrument-record-paths-only.mjs',
      (createTestRunner, test, _mode, cwd) => {
        const createRunner = (): ReturnType<typeof createTestRunner> =>
          createTestRunner().withEnv({ FIXTURES_DIR: join(cwd, 'fixtures') });
        test('records file path but not error messages when only `recordFilePaths` is enabled', async () => {
          const runner = createRunner()
            .expect({
              span: expectFileSpans('GET /readFile-error', [
                {
                  name: 'fs.readFile',
                  status: 'error',
                  // `path_argument` is recorded, but `error.type` is NOT, since `recordErrorMessagesAsSpanAttributes` is off
                  attributes: {
                    path_argument: {
                      type: 'string',
                      value: expect.stringMatching('/fixtures/some-file-that-doesnt-exist.txt'),
                    },
                    [SENTRY_OP]: { type: 'string', value: 'file' },
                    [SENTRY_ORIGIN]: { type: 'string', value: 'auto.file.fs' },
                  },
                },
              ]),
            })
            .start();

          const result = await runner.makeRequest('get', '/readFile-error');
          expect(result).toEqual('done');
          await runner.completed();
        });
      },
      { copyPaths: ['fixtures'] },
    );
  });

  describe('records error messages only', () => {
    createEsmAndCjsTests(
      __dirname,
      'scenario.mjs',
      'instrument-record-errors-only.mjs',
      (createTestRunner, test, _mode, cwd) => {
        const createRunner = (): ReturnType<typeof createTestRunner> =>
          createTestRunner().withEnv({ FIXTURES_DIR: join(cwd, 'fixtures') });
        test('records error messages but not file paths when only `recordErrorMessagesAsSpanAttributes` is enabled', async () => {
          const runner = createRunner()
            .expect({
              span: expectFileSpans('GET /readFile-error', [
                {
                  name: 'fs.readFile',
                  status: 'error',
                  // `error.type` is recorded, but `path_argument` is NOT, since `recordFilePaths` is off
                  attributes: {
                    'error.type': { type: 'string', value: 'ENOENT' },
                    [SENTRY_OP]: { type: 'string', value: 'file' },
                    [SENTRY_ORIGIN]: { type: 'string', value: 'auto.file.fs' },
                  },
                },
              ]),
            })
            .start();

          const result = await runner.makeRequest('get', '/readFile-error');
          expect(result).toEqual('done');
          await runner.completed();
        });

        test('does not record file paths on successful operations when only `recordErrorMessagesAsSpanAttributes` is enabled', async () => {
          const runner = createRunner()
            .expect({
              span: expectFileSpans('GET /readFile', [
                {
                  name: 'fs.readFile',
                  status: 'ok',
                  // Neither `path_argument` nor `error.type` are recorded
                  attributes: {
                    [SENTRY_OP]: { type: 'string', value: 'file' },
                    [SENTRY_ORIGIN]: { type: 'string', value: 'auto.file.fs' },
                  },
                },
              ]),
            })
            .start();

          const result = await runner.makeRequest('get', '/readFile');
          expect(result).toEqual('done');
          await runner.completed();
        });
      },
      { copyPaths: ['fixtures'] },
    );
  });
});
