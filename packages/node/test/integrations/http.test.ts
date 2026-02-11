import { describe, expect, it } from 'vitest';
import { _shouldUseOtelHttpInstrumentation } from '../../src/integrations/http';
import { conditionalTest } from '../helpers/conditional';

describe('httpIntegration', () => {
  describe('_shouldInstrumentSpans', () => {
    it.each([
      [{ spans: true }, {}, true],
      [{ spans: false }, {}, false],
      [{ spans: true }, { skipOpenTelemetrySetup: true }, true],
      [{ spans: false }, { skipOpenTelemetrySetup: true }, false],
      [{}, { skipOpenTelemetrySetup: true }, false],
      [{}, { tracesSampleRate: 0, skipOpenTelemetrySetup: true }, false],
      [{}, { tracesSampleRate: 0 }, true],
    ])('returns the correct value for options=%j and clientOptions=%j', (options, clientOptions, expected) => {
      const actual = _shouldUseOtelHttpInstrumentation(options, clientOptions);
      expect(actual).toBe(expected);
    });

    conditionalTest({ min: 22 })('returns false without tracesSampleRate on Node >=22', () => {
      const actual = _shouldUseOtelHttpInstrumentation({}, {});
      expect(actual).toBe(false);
    });

    conditionalTest({ max: 21 })('returns true without tracesSampleRate on Node <22', () => {
      const actual = _shouldUseOtelHttpInstrumentation({}, {});
      expect(actual).toBe(true);
    });
  });
});
