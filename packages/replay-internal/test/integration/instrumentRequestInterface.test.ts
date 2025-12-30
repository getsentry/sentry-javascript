/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { _INTERNAL_instrumentRequestInterface } from '../../src/integration';

describe('Request instrumentation - instanceof and prototype chain', () => {
  let OriginalRequest: typeof Request;

  beforeEach(() => {
    OriginalRequest = Request;
  });

  it('preserves instanceof checks after instrumentation', () => {
    _INTERNAL_instrumentRequestInterface();

    const request = new Request('https://example.com', {
      method: 'POST',
      body: 'test body',
    });

    expect(request instanceof Request).toBe(true);
    expect(request instanceof OriginalRequest).toBe(true);
  });

  it('preserves prototype chain after instrumentation', () => {
    _INTERNAL_instrumentRequestInterface();

    const request = new Request('https://example.com');

    expect(Object.getPrototypeOf(request)).toBe(OriginalRequest.prototype);
    expect(Request.prototype).toBe(OriginalRequest.prototype);
  });
});
