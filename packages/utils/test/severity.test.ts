import { SeverityLevels } from '@sentry/types';

import { severityFromString } from '../src/severity';

describe('severityFromString()', () => {
  describe('normalize warn and warning', () => {
    test('handles warn and warning', () => {
      expect(severityFromString('warn')).toBe('warning');
      expect(severityFromString('warning')).toBe('warning');
    });
    test('handles warn and warning', () => {
      expect(severityFromString('warn')).toBe('warning');
      expect(severityFromString('warning')).toBe('warning');
    });
  });
  describe('default to log', () => {
    expect(severityFromString('foo')).toBe('log');
  });
  describe('allows ', () => {
    for (const level of SeverityLevels) {
      expect(severityFromString(level)).toBe(level);
    }
  });
});
