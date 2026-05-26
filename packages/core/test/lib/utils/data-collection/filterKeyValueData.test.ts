import { describe, expect, it } from 'vitest';
import { filterKeyValueData } from '../../../../src/utils/data-collection/filterKeyValueData';

describe('filterKeyValueData', () => {
  const sampleData: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: 'Bearer abc123',
    'X-Request-Id': '12345',
    'X-Api-Key': 'secret-key-value',
    'X-Custom': 'safe-value',
  };

  describe('off mode (false)', () => {
    it('returns an empty record', () => {
      expect(filterKeyValueData(sampleData, false)).toEqual({});
    });
  });

  describe('denyList mode (true) - built-in sensitive denylist only', () => {
    it('filters sensitive keys and preserves safe keys', () => {
      const result = filterKeyValueData(sampleData, true);

      expect(result['Content-Type']).toBe('application/json');
      expect(result['X-Request-Id']).toBe('12345');
      expect(result['X-Custom']).toBe('safe-value');
      // "Authorization" matches "auth"
      expect(result['Authorization']).toBe('[Filtered]');
      // "X-Api-Key" matches "key"
      expect(result['X-Api-Key']).toBe('[Filtered]');
    });

    it('preserves all key names', () => {
      const result = filterKeyValueData(sampleData, true);
      expect(Object.keys(result).sort()).toEqual(Object.keys(sampleData).sort());
    });
  });

  describe('denyList mode ({ deny: [...] }) - built-in + extra terms', () => {
    it('filters built-in sensitive keys plus extra deny terms', () => {
      const result = filterKeyValueData(sampleData, { deny: ['x-custom'] });

      expect(result['Content-Type']).toBe('application/json');
      expect(result['X-Request-Id']).toBe('12345');
      // Extra deny term matches
      expect(result['X-Custom']).toBe('[Filtered]');
      // Built-in denylist still applies
      expect(result['Authorization']).toBe('[Filtered]');
      expect(result['X-Api-Key']).toBe('[Filtered]');
    });

    it('matching is case-insensitive and partial', () => {
      const data = { 'My-Custom-Token-Header': 'value1', 'X-Forwarded-For': 'value2' };

      const result = filterKeyValueData(data, { deny: ['forwarded'] });

      // "token" matches built-in denylist
      expect(result['My-Custom-Token-Header']).toBe('[Filtered]');
      // "forwarded" matches extra deny term
      expect(result['X-Forwarded-For']).toBe('[Filtered]');
    });
  });

  describe('allowList mode ({ allow: [...] })', () => {
    it('only allows specified keys to pass through', () => {
      const result = filterKeyValueData(sampleData, { allow: ['content-type', 'x-request-id'] });

      expect(result['Content-Type']).toBe('application/json');
      expect(result['X-Request-Id']).toBe('12345');
      expect(result['X-Custom']).toBe('[Filtered]');
    });

    it('sensitive denylist overrides allowlist', () => {
      const result = filterKeyValueData(sampleData, { allow: ['authorization', 'content-type'] });

      expect(result['Content-Type']).toBe('application/json');
      // "Authorization" matches "auth" in sensitive denylist — always filtered
      expect(result['Authorization']).toBe('[Filtered]');
    });

    it('preserves all key names', () => {
      const result = filterKeyValueData(sampleData, { allow: ['content-type'] });
      expect(Object.keys(result).sort()).toEqual(Object.keys(sampleData).sort());
    });
  });

  describe('sensitive denylist coverage', () => {
    const sensitivePairs: [string, string][] = [
      ['Authorization', 'auth'],
      ['X-Auth-Token', 'auth'],
      ['X-CSRF-Token', 'csrf'],
      ['X-XSRF-Token', 'xsrf'],
      ['Session-Id', 'session'],
      ['X-Api-Key', 'key'],
      ['X-JWT-Token', 'jwt'],
      ['Bearer-Token', 'bearer'],
      ['SSO-Session', 'sso'],
      ['SAML-Response', 'saml'],
      ['Password-Hash', 'password'],
      ['X-Credentials', 'credentials'],
      ['User-SID', 'sid'],
      ['X-Identity', 'identity'],
    ];

    it.each(sensitivePairs)('filters %s (matches "%s")', headerName => {
      const data = { [headerName]: 'some-value' };
      const result = filterKeyValueData(data, true);
      expect(result[headerName]).toBe('[Filtered]');
    });
  });

  describe('edge cases', () => {
    it('handles empty record', () => {
      expect(filterKeyValueData({}, true)).toEqual({});
      expect(filterKeyValueData({}, false)).toEqual({});
      expect(filterKeyValueData({}, { allow: ['x'] })).toEqual({});
      expect(filterKeyValueData({}, { deny: ['x'] })).toEqual({});
    });

    it('handles empty deny terms array (built-in denylist only)', () => {
      const result = filterKeyValueData(sampleData, { deny: [] });
      expect(result['Content-Type']).toBe('application/json');
      expect(result['Authorization']).toBe('[Filtered]');
    });

    it('handles empty allow terms array (everything filtered except sensitive)', () => {
      const result = filterKeyValueData(sampleData, { allow: [] });
      for (const value of Object.values(result)) {
        expect(value).toBe('[Filtered]');
      }
    });
  });
});
