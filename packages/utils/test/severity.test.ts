import { severityFromString, validSeverityLevels } from '../src/severity';

describe('severityFromString()', () => {
  describe('normalize warn and warning', () => {
    test("converts 'warn' to 'warning'", () => {
      expect(severityFromString('warn')).toBe('warning');
    });
  });
  describe('default to log', () => {
    expect(severityFromString('foo')).toBe('log');
  });
  describe('allows ', () => {
    for (const level of validSeverityLevels) {
      expect(severityFromString(level)).toBe(level);
    }
  });
});
