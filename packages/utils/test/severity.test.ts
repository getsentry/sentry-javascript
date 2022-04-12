import { severityFromString, validSeverityLevels } from '../src/severity';

describe('severityFromString()', () => {
  test("converts 'warn' to 'warning'", () => {
    expect(severityFromString('warn')).toBe('warning');
  });

  test('defaults to log', () => {
    expect(severityFromString('foo')).toBe('log');
  });

  test('acts as a pass-through for valid level strings', () => {
    for (const level of validSeverityLevels) {
      expect(severityFromString(level)).toBe(level);
    }
  });
});
