import { describe, expect, it } from 'vitest';
import {
  isNotFoundNavigationError,
  isPrerenderControlFlowError,
  isRedirectNavigationError,
} from '../../src/common/nextNavigationErrorUtils';

function errorWithDigest(digest: string, cause?: unknown): Error {
  return Object.assign(new Error('some message'), { digest, cause });
}

describe('isNotFoundNavigationError', () => {
  it.each(['NEXT_NOT_FOUND', 'NEXT_HTTP_ERROR_FALLBACK;404'])('detects the %s digest', digest => {
    expect(isNotFoundNavigationError(errorWithDigest(digest))).toBe(true);
  });

  it('does not detect unrelated errors', () => {
    expect(isNotFoundNavigationError(new Error('boom'))).toBe(false);
    expect(isNotFoundNavigationError(errorWithDigest('NEXT_REDIRECT;/foo'))).toBe(false);
    expect(isNotFoundNavigationError({ digest: 'NEXT_NOT_FOUND' })).toBe(false);
  });
});

describe('isRedirectNavigationError', () => {
  it('detects a redirect digest', () => {
    expect(isRedirectNavigationError(errorWithDigest('NEXT_REDIRECT;/some-path'))).toBe(true);
  });

  it('does not detect unrelated errors', () => {
    expect(isRedirectNavigationError(errorWithDigest('NEXT_NOT_FOUND'))).toBe(false);
    expect(isRedirectNavigationError(new Error('boom'))).toBe(false);
  });
});

describe('isPrerenderControlFlowError', () => {
  it.each([
    'HANGING_PROMISE_REJECTION',
    'NEXT_PRERENDER_INTERRUPTED',
    'DYNAMIC_SERVER_USAGE',
    'BAILOUT_TO_CLIENT_SIDE_RENDERING',
  ])('detects the %s digest', digest => {
    expect(isPrerenderControlFlowError(errorWithDigest(digest))).toBe(true);
  });

  it('detects a control flow error nested in a cause chain', () => {
    const nested = new Error('outer', { cause: errorWithDigest('HANGING_PROMISE_REJECTION') });
    expect(isPrerenderControlFlowError(nested)).toBe(true);
  });

  it('does not detect navigation errors or regular errors', () => {
    expect(isPrerenderControlFlowError(errorWithDigest('NEXT_REDIRECT;/foo'))).toBe(false);
    expect(isPrerenderControlFlowError(errorWithDigest('NEXT_NOT_FOUND'))).toBe(false);
    expect(isPrerenderControlFlowError(new Error('boom'))).toBe(false);
    expect(isPrerenderControlFlowError(undefined)).toBe(false);
  });

  it('terminates on a self-referencing cause chain', () => {
    const error = new Error('boom');
    (error as Error & { cause: unknown }).cause = error;
    expect(isPrerenderControlFlowError(error)).toBe(false);
  });
});
