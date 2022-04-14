import { severityLevelFromString, validSeverityLevels } from '../src/severity';

describe('severityLevelFromString()', () => {
  test("converts 'warn' to 'warning'", () => {
    expect(severityLevelFromString('warn')).toBe('warning');
  });

  test('defaults to log', () => {
    expect(severityLevelFromString('foo')).toBe('log');
  });

  test('acts as a pass-through for valid level strings', () => {
    for (const level of validSeverityLevels) {
      expect(severityLevelFromString(level)).toBe(level);
    }
  });
});
