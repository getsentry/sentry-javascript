import { describe, expect, it } from 'vitest';
import { envToBool } from '../src/index';

describe('envToBool backwards compatibility', () => {
  it('should be exported from @sentry/node-core for backwards compatibility', () => {
    expect(envToBool).toBeDefined();
    expect(typeof envToBool).toBe('function');
  });

  it('should correctly parse boolean values', () => {
    expect(envToBool('true')).toBe(true);
    expect(envToBool('false')).toBe(false);
    expect(envToBool('1')).toBe(true);
    expect(envToBool('0')).toBe(false);
  });

  it('should return null for invalid values in strict mode', () => {
    expect(envToBool('invalid', { strict: true })).toBe(null);
    expect(envToBool('', { strict: true })).toBe(null);
  });
});
