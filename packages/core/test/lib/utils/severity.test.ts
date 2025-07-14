import { describe, expect, test } from 'vitest';
import { severityLevelFromString } from '../../../src/utils/severity';

describe('severityLevelFromString()', () => {
  test("converts 'warn' to 'warning'", () => {
    expect(severityLevelFromString('warn')).toBe('warning');
  });

  test('defaults to log', () => {
    expect(severityLevelFromString('foo')).toBe('log');
  });

  test('acts as a pass-through for valid level strings', () => {
    for (const level of ['fatal', 'error', 'warning', 'log', 'info', 'debug']) {
      expect(severityLevelFromString(level)).toBe(level);
    }
  });
});
