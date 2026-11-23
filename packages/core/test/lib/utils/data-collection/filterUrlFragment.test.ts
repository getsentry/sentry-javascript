import { describe, expect, it } from 'vitest';
import { filterUrlFragment } from '../../../../src/utils/data-collection/filterUrlFragment';

describe('filterUrlFragment', () => {
  it('returns undefined when collection is off', () => {
    expect(filterUrlFragment('access_token=abc&state=xyz', false)).toBeUndefined();
    expect(filterUrlFragment('details', false)).toBeUndefined();
  });

  it('returns undefined for an empty fragment', () => {
    expect(filterUrlFragment('', true)).toBeUndefined();
  });

  it('filters sensitive key=value pairs across the whole fragment', () => {
    expect(filterUrlFragment('access_token=abc&id_token=def&state=xyz', true)).toBe(
      'access_token=[Filtered]&id_token=[Filtered]&state=xyz',
    );
  });

  it('only treats pairs after the first `?` as params when there is one', () => {
    expect(filterUrlFragment('/callback?token=abc&page=2', true)).toBe('/callback?token=[Filtered]&page=2');
    expect(filterUrlFragment('/a?token=abc?b', true)).toBe('/a?token=[Filtered]');
  });

  it('filters OAuth authorization codes', () => {
    expect(filterUrlFragment('code=abc123&state=xyz', true)).toBe('code=[Filtered]&state=xyz');
  });

  it('keeps anchors and hash route paths as-is', () => {
    expect(filterUrlFragment('details', true)).toBe('details');
    expect(filterUrlFragment('/settings', true)).toBe('/settings');
    expect(filterUrlFragment('token', true)).toBe('token');
  });

  it('keeps segments without `=` next to filtered pairs', () => {
    expect(filterUrlFragment('section&token=abc', true)).toBe('section&token=[Filtered]');
  });

  it('honors allow and deny terms', () => {
    expect(filterUrlFragment('page=1&ref=x', { allow: ['page'] })).toBe('page=1&ref=[Filtered]');
    expect(filterUrlFragment('page=1&utm_source=x', { deny: ['utm'] })).toBe('page=1&utm_source=[Filtered]');
  });

  it('preserves value encoding', () => {
    expect(filterUrlFragment('q=a%20b%26c&token=abc', true)).toBe('q=a%20b%26c&token=[Filtered]');
  });
});
