import type { CapturedErrorContext } from 'nitropack/types';
import { describe, expect, it } from 'vitest';
import { extractErrorContext } from '../../../src/runtime/utils/common';

describe('extractErrorContext', () => {
  it('returns empty object for undefined or empty context', () => {
    expect(extractErrorContext(undefined)).toEqual({});
    expect(extractErrorContext({} as CapturedErrorContext)).toEqual({});
  });

  it('extracts properties from errorContext and drops them if missing', () => {
    const context = {
      event: {
        _method: 'GET',
        _path: '/test',
      },
      tags: ['tag1', 'tag2'],
    } as unknown as CapturedErrorContext;

    expect(extractErrorContext(context)).toEqual({
      method: 'GET',
      path: '/test',
      tags: ['tag1', 'tag2'],
    });

    const partialContext = {
      event: {
        _path: '/test',
      },
    } as unknown as CapturedErrorContext;

    expect(extractErrorContext(partialContext)).toEqual({ path: '/test' });
  });

  it('handles errorContext.tags correctly, including when absent or of unexpected type', () => {
    const contextWithTags = {
      tags: ['tag1', 'tag2'],
    } as unknown as CapturedErrorContext;

    expect(extractErrorContext(contextWithTags)).toEqual({
      tags: ['tag1', 'tag2'],
    });

    const contextWithoutTags = {
      event: {},
    } as CapturedErrorContext;

    expect(extractErrorContext(contextWithoutTags)).toEqual({});

    const contextWithInvalidTags = {
      event: {},
      tags: 'not-an-array',
    } as unknown as CapturedErrorContext;

    expect(extractErrorContext(contextWithInvalidTags)).toEqual({});
  });

  it('gracefully handles unexpected context structure without throwing errors', () => {
    const weirdContext1 = {
      unexpected: 'value',
    } as CapturedErrorContext;
    const weirdContext2 = ['value'] as unknown as CapturedErrorContext;
    const weirdContext3 = 123 as unknown as CapturedErrorContext;

    expect(() => extractErrorContext(weirdContext1)).not.toThrow();
    expect(() => extractErrorContext(weirdContext2)).not.toThrow();
    expect(() => extractErrorContext(weirdContext3)).not.toThrow();
  });
});
