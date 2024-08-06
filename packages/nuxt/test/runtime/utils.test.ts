import { describe, expect, it } from 'vitest';
import { extractErrorContext } from '../../src/runtime/utils';

describe('extractErrorContext', () => {
  it('returns empty object for undefined or empty context', () => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    expect(extractErrorContext(undefined)).toEqual({});
    expect(extractErrorContext({})).toEqual({});
  });

  it('extracts properties from errorContext and drops them if missing', () => {
    const context = {
      event: {
        _method: 'GET',
        _path: '/test',
      },
      tags: ['tag1', 'tag2'],
    };
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    expect(extractErrorContext(context)).toEqual({
      method: 'GET',
      path: '/test',
      tags: ['tag1', 'tag2'],
    });

    const partialContext = {
      event: {
        _path: '/test',
      },
    };
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    expect(extractErrorContext(partialContext)).toEqual({ path: '/test' });
  });

  it('handles errorContext.tags correctly, including when absent or of unexpected type', () => {
    const contextWithTags = {
      tags: ['tag1', 'tag2'],
    };
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    expect(extractErrorContext(contextWithTags)).toEqual({
      tags: ['tag1', 'tag2'],
    });

    const contextWithoutTags = {
      event: {},
    };
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    expect(extractErrorContext(contextWithoutTags)).toEqual({});

    const contextWithInvalidTags = {
      event: {},
      tags: 'not-an-array',
    };
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    expect(extractErrorContext(contextWithInvalidTags)).toEqual({});
  });

  it('gracefully handles unexpected context structure without throwing errors', () => {
    const weirdContext1 = {
      unexpected: 'value',
    };
    const weirdContext2 = ['value'];
    const weirdContext3 = 123;

    expect(() => extractErrorContext(weirdContext1)).not.toThrow();
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    expect(() => extractErrorContext(weirdContext2)).not.toThrow();
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    expect(() => extractErrorContext(weirdContext3)).not.toThrow();
  });
});
