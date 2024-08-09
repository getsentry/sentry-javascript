import { AxiosError } from 'axios';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

/**
 * AxiosError throws before the deprecation warning code is invoked,
 * so mocking it would have no effect.
 *
 * But the deprecation warning is successfully suppressed.
 * This can be verified by running the example code as in the original
 * issue (https://github.com/getsentry/sentry-javascript/issues/12844)
 */
test('suppress fastify deprecation warning when `routerPath` property is accessed', async () => {
  // ensures that the assertions in the catch block are called
  expect.assertions(3);

  const runner = createRunner(__dirname, 'server.ts').start();

  try {
    // Axios from `makeRequest` will throw 404.
    await runner.makeRequest('get', '/test/deprecated/does-not-exist');
  } catch (error) {
    expect(error).toBeInstanceOf(AxiosError);
    if (error instanceof AxiosError) {
      expect(error.message).toBe('Request failed with status code 404');
      expect(error.response?.status).toBe(404);
    }
  }
});
