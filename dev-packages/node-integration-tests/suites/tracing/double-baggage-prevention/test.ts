import { describe, expect } from 'vitest';
import { createEsmAndCjsTests } from '../../../utils/runner';

describe('double baggage prevention', () => {
  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('prevents duplicate headers when using manual getTraceData() with auto-instrumentation', async () => {
      const runner = createRunner().start();

      await runner.completed();

      const logs = runner.getLogs();
      const resultsLine = logs.find(line => line.startsWith('RESULTS: '));
      expect(resultsLine).toBeTruthy();

      const results = JSON.parse(resultsLine!.replace('RESULTS: ', ''));

      expect(results.test1.hasDuplicateSentryTrace).toBe(false);
      expect(results.test1.sentryTrace).toBeDefined();
      expect(results.test1.sentryTrace).toMatch(/^[a-f0-9]{32}-[a-f0-9]{16}-[01]$/);
      expect(results.test1.baggage).toBeDefined();
      expect(results.test1.sentryBaggageCount).toBeGreaterThan(0);

      expect(results.test2.hasDuplicateSentryTrace).toBe(false);
      expect(results.test2.sentryTrace).toBeDefined();
      expect(results.test2.sentryTrace).toMatch(/^[a-f0-9]{32}-[a-f0-9]{16}-[01]$/);
      expect(results.test2.baggage).toBeDefined();
      expect(results.test2.sentryBaggageCount).toBeGreaterThan(0);

      expect(results.test3.hasDuplicateSentryTrace).toBe(false);
      expect(results.test3.sentryTrace).toBeDefined();
      expect(results.test3.sentryTrace).toMatch(/^[a-f0-9]{32}-[a-f0-9]{16}-[01]$/);
      expect(results.test3.baggage).toBeDefined();
      expect(results.test3.sentryBaggageCount).toBeGreaterThan(0);

      expect(results.test4.hasDuplicateSentryTrace).toBe(false);
      expect(results.test4.hasCustomBaggage).toBe(true);
      expect(results.test4.sentryTrace).toBeDefined();
      expect(results.test4.baggage).toContain('custom-key=value');
      expect(results.test4.sentryBaggageCount).toBeGreaterThan(0);
    });
  });
});
