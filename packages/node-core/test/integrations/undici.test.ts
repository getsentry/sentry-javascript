import { SPAN_STATUS_ERROR } from '@sentry/core';
import { channel } from 'node:diagnostics_channel';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { UndiciRequest } from '../../src/integrations/node-fetch/types';

const { span, startInactiveSpan, getClient } = vi.hoisted(() => ({
  span: {},
  startInactiveSpan: vi.fn(),
  getClient: vi.fn(),
}));

vi.mock('@sentry/core', async () => {
  const actual = (await vi.importActual('@sentry/core')) as Record<string, unknown>;
  return {
    ...actual,
    getClient,
    startInactiveSpan: startInactiveSpan.mockReturnValue(span),
  };
});

vi.mock('../../src/utils/outgoingFetchRequest', () => ({
  addFetchRequestBreadcrumb: vi.fn(),
  addTracePropagationHeadersToFetchRequest: vi.fn(),
}));

describe('instrumentUndici', () => {
  beforeAll(async () => {
    const { instrumentUndici } = await import('../../src/integrations/node-fetch/undici-instrumentation');
    instrumentUndici({ spans: true });
  });

  beforeEach(() => {
    startInactiveSpan.mockClear();
    getClient.mockReturnValue(undefined);
  });

  describe('request errors', () => {
    function startRequest(): { request: UndiciRequest; testSpan: { setStatus: Mock; setAttributes: Mock; end: Mock } } {
      const testSpan = { setStatus: vi.fn(), setAttributes: vi.fn(), end: vi.fn() };
      startInactiveSpan.mockReturnValueOnce(testSpan);
      const request = {
        method: 'GET',
        origin: 'https://api.example.com',
        path: '/stream',
        headers: [],
      } as unknown as UndiciRequest;
      channel('undici:request:create').publish({ request });
      channel('undici:request:headers').publish({
        request,
        response: { statusCode: 200, statusText: 'OK', headers: [] },
      });
      return { request, testSpan };
    }

    it.each([
      ['an AbortError', () => Object.assign(new Error('aborted'), { name: 'AbortError' })],
      ['a DOMException named AbortError', () => new DOMException('This operation was aborted', 'AbortError')],
      [
        'a DOMException with only the ABORT_ERR code',
        () => Object.defineProperty(new DOMException('aborted', 'Other'), 'code', { value: DOMException.ABORT_ERR }),
      ],
    ])('ends the span without an error status when the request is aborted (%s)', (_name, makeError) => {
      const { request, testSpan } = startRequest();

      channel('undici:request:error').publish({ request, error: makeError() });

      expect(testSpan.setStatus).not.toHaveBeenCalledWith(expect.objectContaining({ code: SPAN_STATUS_ERROR }));
      expect(testSpan.end).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['a TypeError', () => new TypeError('fetch failed')],
      ['ECONNRESET', () => Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })],
    ])('still sets an error status for a non-abort error (%s)', (_name, makeError) => {
      const { request, testSpan } = startRequest();

      channel('undici:request:error').publish({ request, error: makeError() });

      expect(testSpan.setStatus).toHaveBeenCalledWith({ code: SPAN_STATUS_ERROR, message: expect.any(String) });
      expect(testSpan.end).toHaveBeenCalledTimes(1);
    });
  });
});
