import { describe, expect, it } from 'vitest';
import { getClientIPAddress } from '../../../src/utils/clientIPAddress';

describe('getClientIPAddress', () => {
  it.each([
    ['203.0.113.7', '203.0.113.7'],
    ['203.0.113.7:4711', '203.0.113.7'],
    ['unknown, 203.0.113.7:4711', '203.0.113.7'],
    ['[2001:db8::1]:4711', '2001:db8::1'],
    ['[2001:db8::1]', '2001:db8::1'],
    ['2001:db8::1', '2001:db8::1'],
    ['unknown', null],
  ])('parses the X-Forwarded-For value %s', (headerValue, expectedIP) => {
    expect(getClientIPAddress({ 'X-Forwarded-For': headerValue })).toBe(expectedIP);
  });

  it.each([
    ['for=203.0.113.7', '203.0.113.7'],
    ['For=203.0.113.7', '203.0.113.7'],
    ['proto=https;for=203.0.113.7', '203.0.113.7'],
    ['for="203.0.113.7:4711"', '203.0.113.7'],
    ['for="[2001:db8::1]:4711"', '2001:db8::1'],
    ['for=203.0.113.7;proto=https, for=198.51.100.1', '203.0.113.7'],
    ['proto=https', null],
    ['for=_hidden', null],
  ])('parses the Forwarded value %s', (headerValue, expectedIP) => {
    expect(getClientIPAddress({ Forwarded: headerValue })).toBe(expectedIP);
  });

  it('joins array header values', () => {
    expect(getClientIPAddress({ 'x-forwarded-for': ['unknown', '203.0.113.7:4711'] })).toBe('203.0.113.7');
  });

  it('keeps the header priority order', () => {
    expect(getClientIPAddress({ 'X-Real-IP': '198.51.100.1', 'X-Forwarded-For': '203.0.113.7:4711' })).toBe(
      '203.0.113.7',
    );
  });
});
