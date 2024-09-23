import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

describe('express without tracing', () => {
  test('correctly applies isolation scope even without tracing', done => {
    const runner = createRunner(__dirname, 'server.ts')
      .expect({
        event: {
          transaction: 'GET /test/isolationScope/1',
          tags: {
            global: 'tag',
            'isolation-scope': 'tag',
            'isolation-scope-1': '1',
          },
          // Request is correctly set
          request: {
            url: expect.stringMatching(/^http:\/\/localhost:(\d+)\/test\/isolationScope\/1$/),
            method: 'GET',
            headers: {
              'user-agent': expect.stringContaining(''),
            },
          },
        },
      })
      .start(done);

    runner.makeRequest('get', '/test/isolationScope/1');
  });

  describe('request data', () => {
    test('correctly captures JSON request data', done => {
      const runner = createRunner(__dirname, 'server.ts')
        .expect({
          event: {
            transaction: 'POST /test-post',
            request: {
              url: expect.stringMatching(/^http:\/\/localhost:(\d+)\/test-post$/),
              method: 'POST',
              headers: {
                'user-agent': expect.stringContaining(''),
                'content-type': 'application/json',
              },
              data: JSON.stringify({
                foo: 'bar',
                other: 1,
              }),
            },
          },
        })
        .start(done);

      runner.makeRequest('post', '/test-post', {}, { foo: 'bar', other: 1 });
    });

    test('correctly captures plain text request data', done => {
      const runner = createRunner(__dirname, 'server.ts')
        .expect({
          event: {
            transaction: 'POST /test-post',
            request: {
              url: expect.stringMatching(/^http:\/\/localhost:(\d+)\/test-post$/),
              method: 'POST',
              headers: {
                'user-agent': expect.stringContaining(''),
                'content-type': 'text/plain',
              },
              data: 'some plain text',
            },
          },
        })
        .start(done);

      runner.makeRequest(
        'post',
        '/test-post',
        {
          'Content-Type': 'text/plain',
        },
        'some plain text',
      );
    });

    test('correctly captures text buffer request data', done => {
      const runner = createRunner(__dirname, 'server.ts')
        .expect({
          event: {
            transaction: 'POST /test-post',
            request: {
              url: expect.stringMatching(/^http:\/\/localhost:(\d+)\/test-post$/),
              method: 'POST',
              headers: {
                'user-agent': expect.stringContaining(''),
                'content-type': 'application/octet-stream',
              },
              data: 'some plain text in buffer',
            },
          },
        })
        .start(done);

      runner.makeRequest(
        'post',
        '/test-post',
        { 'Content-Type': 'application/octet-stream' },
        Buffer.from('some plain text in buffer'),
      );
    });

    test('correctly captures non-text buffer request data', done => {
      const runner = createRunner(__dirname, 'server.ts')
        .expect({
          event: {
            transaction: 'POST /test-post',
            request: {
              url: expect.stringMatching(/^http:\/\/localhost:(\d+)\/test-post$/),
              method: 'POST',
              headers: {
                'user-agent': expect.stringContaining(''),
                'content-type': 'application/octet-stream',
              },
              // This is some non-ascii string representation
              data: expect.any(String),
            },
          },
        })
        .start(done);

      const body = new Uint8Array([1, 2, 3, 4, 5]).buffer;

      runner.makeRequest('post', '/test-post', { 'Content-Type': 'application/octet-stream' }, body);
    });
  });
});
