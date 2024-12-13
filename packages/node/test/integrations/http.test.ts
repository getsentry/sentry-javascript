import { _shouldInstrumentSpans } from '../../src/integrations/http';

describe('httpIntegration', () => {
  describe('_shouldInstrumentSpans', () => {
    it.each([
      [{}, {}, true],
      [{ spans: true }, {}, true],
      [{ spans: false }, {}, false],
      [{ spans: true }, { skipOpenTelemetrySetup: true }, true],
      [{ spans: false }, { skipOpenTelemetrySetup: true }, false],
      [{}, { skipOpenTelemetrySetup: true }, false],
      [{}, { skipOpenTelemetrySetup: false }, true],
    ])('returns the correct value for options=%p and clientOptions=%p', (options, clientOptions, expected) => {
      const actual = _shouldInstrumentSpans(options, clientOptions);
      expect(actual).toBe(expected);
    });
  });
});
