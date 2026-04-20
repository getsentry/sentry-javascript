import { afterAll, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

const ROUTES = ['/sync', '/async'] as const;
const METHODS = ['get', 'post', 'put', 'delete', 'patch'] as const;
const PATHS = ['/', '/all', '/on'] as const;

type Method = (typeof METHODS)[number];

function verifyHonoSpan(name: string, type: 'middleware' | 'request_handler') {
  return expect.objectContaining({
    data: expect.objectContaining({
      'hono.name': name,
      'hono.type': type,
    }),
    description: name,
    op: type === 'request_handler' ? 'request_handler.hono' : 'middleware.hono',
    origin: 'auto.http.otel.hono',
  });
}

function baseSpans() {
  return [
    verifyHonoSpan('sentryRequestMiddleware', 'middleware'),
    verifyHonoSpan('sentryErrorMiddleware', 'middleware'),
    verifyHonoSpan('global', 'middleware'),
    verifyHonoSpan('base', 'middleware'),
  ];
}

afterAll(() => {
  cleanupChildProcesses();
});

createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
  test('should handle transactions for all route/method/path combinations', async () => {
    const runner = createRunner();
    const requests: Array<{ method: Method; url: string }> = [];

    for (const route of ROUTES) {
      for (const method of METHODS) {
        for (const path of PATHS) {
          const pathSuffix = path === '/' ? '' : path;
          const fullPath = `${route}${pathSuffix}`;

          runner.expect({
            transaction: {
              transaction: `${method.toUpperCase()} ${fullPath}`,
              spans: expect.arrayContaining([...baseSpans(), verifyHonoSpan(fullPath, 'request_handler')]),
            },
          });
          requests.push({ method, url: fullPath });

          runner.expect({
            transaction: {
              transaction: `${method.toUpperCase()} ${fullPath}/middleware`,
              spans: expect.arrayContaining([
                ...baseSpans(),
                verifyHonoSpan('anonymous', 'middleware'),
                verifyHonoSpan(`${fullPath}/middleware`, 'request_handler'),
              ]),
            },
          });
          requests.push({ method, url: `${fullPath}/middleware` });

          runner.expect({
            transaction: {
              transaction: `${method.toUpperCase()} ${fullPath}/middleware/separately`,
              spans: expect.arrayContaining([
                ...baseSpans(),
                verifyHonoSpan('anonymous', 'middleware'),
                verifyHonoSpan(`${fullPath}/middleware/separately`, 'request_handler'),
              ]),
            },
          });
          requests.push({ method, url: `${fullPath}/middleware/separately` });
        }
      }
    }

    const started = runner.start();
    for (const req of requests) {
      await started.makeRequest(req.method, req.url);
    }
    await started.completed();
  }, 60_000);

  test('should capture 500 errors for all route/method/path combinations', async () => {
    const runner = createRunner().ignore('transaction');
    const requests: Array<{ method: Method; url: string }> = [];

    for (const route of ROUTES) {
      for (const method of METHODS) {
        for (const path of PATHS) {
          const pathSuffix = path === '/' ? '' : path;

          runner.expect({
            event: {
              exception: {
                values: [
                  {
                    mechanism: {
                      type: 'auto.middleware.hono',
                      handled: false,
                    },
                    type: 'Error',
                    value: 'response 500',
                  },
                ],
              },
            },
          });
          requests.push({ method, url: `${route}${pathSuffix}/500` });
        }
      }
    }

    const started = runner.start();
    for (const req of requests) {
      await started.makeRequest(req.method, req.url, { expectError: true });
    }
    await started.completed();
  }, 60_000);

  test.each(['/401', '/402', '/403', '/does-not-exist'])('should not capture %s errors', async (subPath: string) => {
    const runner = createRunner()
      .expect({
        transaction: {
          transaction: 'GET /sync',
        },
      })
      .start();
    runner.makeRequest('get', `/sync${subPath}`, { expectError: true });
    runner.makeRequest('get', '/sync');
    await runner.completed();
  });
});
