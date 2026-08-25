import { describe, expect, it } from 'vitest';
import { serializeCustomHeaders } from '../../src/core/cli';

describe('serializeCustomHeaders', () => {
  it('returns undefined for an empty object', () => {
    expect(serializeCustomHeaders({})).toBeUndefined();
  });

  it('joins headers in the CLI format', () => {
    expect(serializeCustomHeaders({ 'X-One': '1', 'X-Two': 'two words' })).toBe('X-One: 1; X-Two: two words');
  });

  it('keeps colons inside values', () => {
    expect(serializeCustomHeaders({ 'X-Url': 'https://example.com' })).toBe('X-Url: https://example.com');
  });

  it.each([['a; b'], ['a\nb'], ['a\r\nb']])('rejects the value %j because it contains a separator', value => {
    expect(() => serializeCustomHeaders({ 'X-Bad': value })).toThrow('Invalid value for header "X-Bad"');
  });
});
