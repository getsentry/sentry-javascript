import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/node';
import { cleanupChildProcesses, createRunner } from '../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should create spans for fs operations that take target argument', done => {
  const runner = createRunner(__dirname, 'server.ts')
    .ignore('event')
    .expect({
      transaction: {
        transaction: 'GET /readFile-error',
        spans: expect.arrayContaining([
          expect.objectContaining({
            description: 'fs.readFile',
            op: 'file',
            status: 'unknown_error',
            data: {
              fs_error: expect.stringMatching('ENOENT: no such file or directory,'),
              path_argument: expect.stringMatching('/fixtures/some-file-that-doesnt-exist.txt'),
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'file',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.file.fs',
            },
          }),
        ]),
      },
    })
    .start(done);

  expect(runner.makeRequest('get', '/readFile-error')).resolves.toBe('done');
});

test('should create breadcrumbs for fs operations', done => {
  const runner = createRunner(__dirname, 'server.ts')
    .ignore('transaction')
    .expect({
      event: {
        breadcrumbs: expect.arrayContaining([
          expect.objectContaining({
            timestamp: expect.any(Number),
            message: 'fs.readFile',
            level: 'error',
            data: {
              path_argument: expect.stringContaining('some-file-that-doesnt-exist.txt'),
              fs_error: expect.stringContaining('ENOENT: no such file or directory'),
            },
          }),
        ]),
      },
    })
    .start(done);

  expect(runner.makeRequest('get', '/readFile-error')).resolves.toBe('done');
});

test('should create spans for fs operations that take one path', done => {
  const runner = createRunner(__dirname, 'server.ts')
    .expect({
      transaction: {
        transaction: 'GET /readFile',
        spans: expect.arrayContaining([
          expect.objectContaining({
            description: 'fs.readFile',
            op: 'file',
            status: 'ok',
            data: {
              path_argument: expect.stringMatching('/fixtures/some-file.txt'),
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'file',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.file.fs',
            },
          }),
          expect.objectContaining({
            description: 'fs.readFile',
            op: 'file',
            status: 'ok',
            data: {
              path_argument: expect.stringMatching('/fixtures/some-file-promises.txt'),
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'file',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.file.fs',
            },
          }),
          expect.objectContaining({
            description: 'fs.readFile',
            op: 'file',
            status: 'ok',
            data: {
              path_argument: expect.stringMatching('/fixtures/some-file-promisify.txt'),
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'file',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.file.fs',
            },
          }),
        ]),
      },
    })
    .start(done);

  expect(runner.makeRequest('get', '/readFile')).resolves.toBe('done');
});

test('should create spans for fs operations that take src and dest arguments', done => {
  const runner = createRunner(__dirname, 'server.ts')
    .expect({
      transaction: {
        transaction: 'GET /copyFile',
        spans: expect.arrayContaining([
          expect.objectContaining({
            description: 'fs.copyFile',
            op: 'file',
            status: 'ok',
            data: {
              src_argument: expect.stringMatching('/fixtures/some-file.txt'),
              dest_argument: expect.stringMatching('/fixtures/some-file.txt.copy'),
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'file',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.file.fs',
            },
          }),
          expect.objectContaining({
            description: 'fs.copyFile',
            op: 'file',
            status: 'ok',
            data: {
              src_argument: expect.stringMatching('/fixtures/some-file-promises.txt'),
              dest_argument: expect.stringMatching('/fixtures/some-file-promises.txt.copy'),
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'file',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.file.fs',
            },
          }),
          expect.objectContaining({
            description: 'fs.copyFile',
            op: 'file',
            status: 'ok',
            data: {
              src_argument: expect.stringMatching('/fixtures/some-file-promisify.txt'),
              dest_argument: expect.stringMatching('/fixtures/some-file-promisify.txt.copy'),
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'file',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.file.fs',
            },
          }),
        ]),
      },
    })
    .start(done);

  expect(runner.makeRequest('get', '/copyFile')).resolves.toBe('done');
});

test('should create spans for fs operations that take existing path and new path arguments', done => {
  const runner = createRunner(__dirname, 'server.ts')
    .expect({
      transaction: {
        transaction: 'GET /link',
        spans: expect.arrayContaining([
          expect.objectContaining({
            description: 'fs.link',
            op: 'file',
            status: 'ok',
            data: {
              existing_path_argument: expect.stringMatching('/fixtures/some-file.txt'),
              new_path_argument: expect.stringMatching('/fixtures/some-file.txt.link'),
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'file',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.file.fs',
            },
          }),
          expect.objectContaining({
            description: 'fs.link',
            op: 'file',
            status: 'ok',
            data: {
              existing_path_argument: expect.stringMatching('/some-file-promises.txt'),
              new_path_argument: expect.stringMatching('/some-file-promises.txt.link'),
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'file',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.file.fs',
            },
          }),
          expect.objectContaining({
            description: 'fs.link',
            op: 'file',
            status: 'ok',
            data: {
              existing_path_argument: expect.stringMatching('/fixtures/some-file-promisify.txt'),
              new_path_argument: expect.stringMatching('/fixtures/some-file-promisify.txt.link'),
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'file',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.file.fs',
            },
          }),
        ]),
      },
    })
    .start(done);

  expect(runner.makeRequest('get', '/link')).resolves.toBe('done');
});

test('should create spans for fs operations that take prefix argument', done => {
  const runner = createRunner(__dirname, 'server.ts')
    .expect({
      transaction: {
        transaction: 'GET /mkdtemp',
        spans: expect.arrayContaining([
          expect.objectContaining({
            description: 'fs.mkdtemp',
            op: 'file',
            status: 'ok',
            data: {
              prefix_argument: expect.stringMatching('/foo-'),
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'file',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.file.fs',
            },
          }),
          expect.objectContaining({
            description: 'fs.mkdtemp',
            op: 'file',
            status: 'ok',
            data: {
              prefix_argument: expect.stringMatching('/foo-'),
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'file',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.file.fs',
            },
          }),
          expect.objectContaining({
            description: 'fs.mkdtemp',
            op: 'file',
            status: 'ok',
            data: {
              prefix_argument: expect.stringMatching('/foo-'),
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'file',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.file.fs',
            },
          }),
        ]),
      },
    })
    .start(done);

  expect(runner.makeRequest('get', '/mkdtemp')).resolves.toBe('done');
});

test('should create spans for fs operations that take target argument', done => {
  const runner = createRunner(__dirname, 'server.ts')
    .expect({
      transaction: {
        transaction: 'GET /symlink',
        spans: expect.arrayContaining([
          expect.objectContaining({
            description: 'fs.symlink',
            op: 'file',
            status: 'ok',
            data: {
              target_argument: expect.stringMatching('/some-file-promisify.txt'),
              path_argument: expect.stringMatching('/some-file-promisify.txt.symlink'),
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'file',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.file.fs',
            },
          }),
          expect.objectContaining({
            description: 'fs.symlink',
            op: 'file',
            status: 'ok',
            data: {
              target_argument: expect.stringMatching('/fixtures/some-file-promisify.txt'),
              path_argument: expect.stringMatching('/fixtures/some-file-promisify.txt.symlink'),
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'file',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.file.fs',
            },
          }),
          expect.objectContaining({
            description: 'fs.symlink',
            op: 'file',
            status: 'ok',
            data: {
              target_argument: expect.stringMatching('/fixtures/some-file-promisify.txt'),
              path_argument: expect.stringMatching('/fixtures/some-file-promisify.txt.symlink'),
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'file',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.file.fs',
            },
          }),
        ]),
      },
    })
    .start(done);

  expect(runner.makeRequest('get', '/symlink')).resolves.toBe('done');
});
