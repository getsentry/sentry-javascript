import { afterAll, expect, test } from 'vitest';
import { conditionalTest } from '../../../utils';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

conditionalTest({ min: 22 })('light mode ipAddress handling', () => {
  test('does not include ip_address on events when sendDefaultPii is not set', async () => {
    const runner = createRunner(__dirname, 'without-sendDefaultPii/server.js')
      .expect({
        event: event => {
          expect(event.exception?.values?.[0]?.value).toBe('test error');
          expect(event.user?.ip_address).toBeUndefined();
        },
      })
      .start();

    runner.makeRequest('get', '/test-error');
    await runner.completed();
  });

  test('includes ip_address on events when sendDefaultPii is true', async () => {
    const runner = createRunner(__dirname, 'with-sendDefaultPii/server.js')
      .expect({
        event: event => {
          expect(event.exception?.values?.[0]?.value).toBe('test error');
          expect(event.user?.ip_address).toBeDefined();
        },
      })
      .start();

    runner.makeRequest('get', '/test-error');
    await runner.completed();
  });

  // Even with sendDefaultPii: true, if requestDataIntegration is removed, ipAddress should not
  // leak onto the event. The ipAddress is stored in sdkProcessingMetadata on the isolation scope,
  // and only requestDataIntegration promotes it to event.user.ip_address. Without it,
  // sdkProcessingMetadata is stripped before envelope serialization (in envelope.ts).
  test('does not include ip_address on events when requestDataIntegration is removed', async () => {
    const runner = createRunner(__dirname, 'without-requestDataIntegration/server.js')
      .expect({
        event: event => {
          expect(event.exception?.values?.[0]?.value).toBe('test error');
          expect(event.user?.ip_address).toBeUndefined();
        },
      })
      .start();

    runner.makeRequest('get', '/test-error');
    await runner.completed();
  });
});
