import type { SerializedStreamedSpanContainer } from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/node';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createCjsTests } from '../../utils/runner';

type FileSpan = Pick<SerializedStreamedSpanContainer['items'][number], 'name' | 'status' | 'attributes'>;

function expectFileSpans(
  segmentName: string,
  expected: FileSpan[],
): (container: SerializedStreamedSpanContainer) => void {
  const spans: SerializedStreamedSpanContainer['items'] = [];

  return container => {
    spans.push(...container.items);
    const segment = spans.find(span => span.is_segment && span.name === segmentName);
    expect(segment).toBeDefined();

    const fileSpans = spans.filter(
      span => span.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]?.value === 'file' && span.trace_id === segment!.trace_id,
    );
    expect(
      fileSpans.map(({ name, status, attributes }) => ({
        name,
        status,
        attributes: Object.fromEntries(
          Object.entries(attributes).filter(
            ([key]) =>
              key.endsWith('_argument') ||
              key === 'error.type' ||
              key === SEMANTIC_ATTRIBUTE_SENTRY_OP ||
              key === SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
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
    createCjsTests(
      __dirname,
      'scenario.mjs',
      'instrument.mjs',
      (createRunner, test) => {
        test('should create spans for fs operations that take target argument', async () => {
          const runner = createRunner()
            .unordered()
            .expect({
              span: expectFileSpans('GET /readFile-error', [
                {
                  name: 'fs.readFile',
                  status: 'error',
                  attributes: {
                    'error.type': { type: 'string', value: 'ENOENT' },
                    path_argument: {
                      type: 'string',
                      value: expect.stringMatching('/fixtures/some-file-that-doesnt-exist.txt'),
                    },
                    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: { type: 'string', value: 'file' },
                    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: { type: 'string', value: 'auto.file.fs' },
                  },
                },
              ]),
            })
            .start();

          const result = await runner.makeRequest('get', '/readFile-error');
          expect(result).toEqual('done');
          await runner.completed();
        });

        test('should create spans for fs operations that take one path', async () => {
          const runner = createRunner()
            .unordered()
            .expect({
              span: expectFileSpans('GET /readFile', [
                {
                  name: 'fs.readFile',
                  status: 'ok',
                  attributes: {
                    path_argument: { type: 'string', value: expect.stringMatching('/fixtures/some-file.txt') },
                    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: { type: 'string', value: 'file' },
                    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: { type: 'string', value: 'auto.file.fs' },
                  },
                },
                {
                  name: 'fs.readFile',
                  status: 'ok',
                  attributes: {
                    path_argument: { type: 'string', value: expect.stringMatching('/fixtures/some-file-promises.txt') },
                    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: { type: 'string', value: 'file' },
                    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: { type: 'string', value: 'auto.file.fs' },
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
                    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: { type: 'string', value: 'file' },
                    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: { type: 'string', value: 'auto.file.fs' },
                  },
                },
              ]),
            })
            .start();

          const result = await runner.makeRequest('get', '/readFile');
          expect(result).toEqual('done');
          await runner.completed();
        });

        test('should create spans for fs operations that take src and dest arguments', async () => {
          const runner = createRunner()
            .unordered()
            .expect({
              span: expectFileSpans('GET /copyFile', [
                {
                  name: 'fs.copyFile',
                  status: 'ok',
                  attributes: {
                    src_argument: { type: 'string', value: expect.stringMatching('/fixtures/some-file.txt') },
                    dest_argument: { type: 'string', value: expect.stringMatching('/fixtures/some-file.txt.copy') },
                    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: { type: 'string', value: 'file' },
                    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: { type: 'string', value: 'auto.file.fs' },
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
                    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: { type: 'string', value: 'file' },
                    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: { type: 'string', value: 'auto.file.fs' },
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
                    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: { type: 'string', value: 'file' },
                    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: { type: 'string', value: 'auto.file.fs' },
                  },
                },
              ]),
            })
            .start();

          const result = await runner.makeRequest('get', '/copyFile');
          expect(result).toEqual('done');
          await runner.completed();
        });

        test('should create spans for fs operations that take existing path and new path arguments', async () => {
          const runner = createRunner()
            .unordered()
            .expect({
              span: expectFileSpans('GET /link', [
                {
                  name: 'fs.link',
                  status: 'ok',
                  attributes: {
                    existing_path_argument: { type: 'string', value: expect.stringMatching('/fixtures/some-file.txt') },
                    new_path_argument: { type: 'string', value: expect.stringMatching('/fixtures/some-file.txt.link') },
                    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: { type: 'string', value: 'file' },
                    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: { type: 'string', value: 'auto.file.fs' },
                  },
                },
                {
                  name: 'fs.link',
                  status: 'ok',
                  attributes: {
                    existing_path_argument: { type: 'string', value: expect.stringMatching('/some-file-promises.txt') },
                    new_path_argument: { type: 'string', value: expect.stringMatching('/some-file-promises.txt.link') },
                    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: { type: 'string', value: 'file' },
                    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: { type: 'string', value: 'auto.file.fs' },
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
                    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: { type: 'string', value: 'file' },
                    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: { type: 'string', value: 'auto.file.fs' },
                  },
                },
              ]),
            })
            .start();

          const result = await runner.makeRequest('get', '/link');
          expect(result).toEqual('done');
          await runner.completed();
        });

        test('should create spans for fs operations that take prefix argument', async () => {
          const runner = createRunner()
            .unordered()
            .expect({
              span: expectFileSpans('GET /mkdtemp', [
                {
                  name: 'fs.mkdtemp',
                  status: 'ok',
                  attributes: {
                    prefix_argument: { type: 'string', value: expect.stringMatching('/foo-') },
                    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: { type: 'string', value: 'file' },
                    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: { type: 'string', value: 'auto.file.fs' },
                  },
                },
                {
                  name: 'fs.mkdtemp',
                  status: 'ok',
                  attributes: {
                    prefix_argument: { type: 'string', value: expect.stringMatching('/foo-') },
                    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: { type: 'string', value: 'file' },
                    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: { type: 'string', value: 'auto.file.fs' },
                  },
                },
                {
                  name: 'fs.mkdtemp',
                  status: 'ok',
                  attributes: {
                    prefix_argument: { type: 'string', value: expect.stringMatching('/foo-') },
                    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: { type: 'string', value: 'file' },
                    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: { type: 'string', value: 'auto.file.fs' },
                  },
                },
              ]),
            })
            .start();

          const result = await runner.makeRequest('get', '/mkdtemp');
          expect(result).toEqual('done');
          await runner.completed();
        });

        test('should create spans for fs symlink operations that take target argument', async () => {
          const runner = createRunner()
            .unordered()
            .expect({
              span: expectFileSpans('GET /symlink', [
                {
                  name: 'fs.symlink',
                  status: 'ok',
                  attributes: {
                    target_argument: { type: 'string', value: expect.stringMatching('/some-file-promisify.txt') },
                    path_argument: { type: 'string', value: expect.stringMatching('/some-file-promisify.txt.symlink') },
                    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: { type: 'string', value: 'file' },
                    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: { type: 'string', value: 'auto.file.fs' },
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
                    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: { type: 'string', value: 'file' },
                    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: { type: 'string', value: 'auto.file.fs' },
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
                    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: { type: 'string', value: 'file' },
                    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: { type: 'string', value: 'auto.file.fs' },
                  },
                },
              ]),
            })
            .start();

          const result = await runner.makeRequest('get', '/symlink');
          expect(result).toEqual('done');
          await runner.completed();
        });

        test('should create spans for fs.exists callback and promisified versions', async () => {
          const runner = createRunner()
            .unordered()
            .expect({
              span: expectFileSpans('GET /exists', [
                {
                  name: 'fs.exists',
                  status: 'ok',
                  attributes: {
                    path_argument: { type: 'string', value: expect.stringMatching('/fixtures/some-file.txt') },
                    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: { type: 'string', value: 'file' },
                    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: { type: 'string', value: 'auto.file.fs' },
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
                    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: { type: 'string', value: 'file' },
                    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: { type: 'string', value: 'auto.file.fs' },
                  },
                },
              ]),
            })
            .start();

          const result = await runner.makeRequest('get', '/exists');
          expect(result).toEqual('done');
          await runner.completed();
        });
      },
      { copyPaths: ['fixtures'] },
    );
  });

  describe('records file paths only', () => {
    createCjsTests(
      __dirname,
      'scenario.mjs',
      'instrument-record-paths-only.mjs',
      (createRunner, test) => {
        test('records file path but not error messages when only `recordFilePaths` is enabled', async () => {
          const runner = createRunner()
            .unordered()
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
                    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: { type: 'string', value: 'file' },
                    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: { type: 'string', value: 'auto.file.fs' },
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
    createCjsTests(
      __dirname,
      'scenario.mjs',
      'instrument-record-errors-only.mjs',
      (createRunner, test) => {
        test('records error messages but not file paths when only `recordErrorMessagesAsSpanAttributes` is enabled', async () => {
          const runner = createRunner()
            .unordered()
            .expect({
              span: expectFileSpans('GET /readFile-error', [
                {
                  name: 'fs.readFile',
                  status: 'error',
                  // `error.type` is recorded, but `path_argument` is NOT, since `recordFilePaths` is off
                  attributes: {
                    'error.type': { type: 'string', value: 'ENOENT' },
                    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: { type: 'string', value: 'file' },
                    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: { type: 'string', value: 'auto.file.fs' },
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
            .unordered()
            .expect({
              span: expectFileSpans('GET /readFile', [
                {
                  name: 'fs.readFile',
                  status: 'ok',
                  // Neither `path_argument` nor `error.type` are recorded
                  attributes: {
                    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: { type: 'string', value: 'file' },
                    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: { type: 'string', value: 'auto.file.fs' },
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
