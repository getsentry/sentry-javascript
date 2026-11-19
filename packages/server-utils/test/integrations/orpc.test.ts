import { describe, expect, it } from 'vitest';
import { defaultShouldHandleError } from '../../src/integrations/orpc/instrumentation';

function orpcError(code: string): Error {
  return Object.assign(new Error(code), { name: 'ORPCError', code });
}

describe('defaultShouldHandleError', () => {
  it.each([
    ['an error without a status', new Error('boom'), true],
    ['a non-object', 'boom', true],
    ['an error with a status', Object.assign(new Error('Not found'), { status: 404 }), true],
    ['an INTERNAL_SERVER_ERROR ORPCError', orpcError('INTERNAL_SERVER_ERROR'), true],
    ['a NOT_FOUND ORPCError', orpcError('NOT_FOUND'), false],
    ['an ORPCError with a custom code', orpcError('RATE_LIMITED'), false],
    ['an abort error', Object.assign(new Error('aborted'), { name: 'AbortError' }), false],
  ])('returns the right result for %s', (_, error, expected) => {
    expect(defaultShouldHandleError(error)).toBe(expected);
  });
});
