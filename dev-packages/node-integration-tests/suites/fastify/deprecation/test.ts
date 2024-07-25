import { AxiosError } from 'axios';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('suppress fastify deprecation warning when `routerPath` property is accessed', async () => {
  // ensures that the assertions in the catch block are called
  expect.assertions(3);

  const runner = createRunner(__dirname, 'server.ts').start();

  try {
    // Axios from `makeRequest` will throw 404.
    await runner.makeRequest('get', '/test/deprecated/does-not-exist');
  } catch (error: any) {
    expect(error).toBeInstanceOf(AxiosError);
    expect(error.message).toBe('Request failed with status code 404');
    expect(error.response.status).toBe(404);
  }
});
