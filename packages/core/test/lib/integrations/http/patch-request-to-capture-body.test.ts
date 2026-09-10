import { describe, expect, it, vi } from 'vitest';
import { patchRequestToCaptureBody } from '../../../../src/integrations/http/patch-request-to-capture-body';
import type { HttpIncomingMessage } from '../../../../src/integrations/http/types';
import type { Scope } from '../../../../src/scope';

function makeFakeRequest(): { req: HttpIncomingMessage; emit: (event: string, ...args: unknown[]) => void } {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const req: any = {
    on(event: string, cb: (...args: unknown[]) => void) {
      (listeners[event] ??= []).push(cb);
      return req;
    },
    off(event: string, cb: (...args: unknown[]) => void) {
      listeners[event] = (listeners[event] ?? []).filter(listener => listener !== cb);
      return req;
    },
  };
  req.addListener = req.on;
  req.removeListener = req.off;

  return {
    req: req as HttpIncomingMessage,
    emit: (event, ...args) => (listeners[event] ?? []).slice().forEach(cb => cb(...args)),
  };
}

function capture(chunks: string[]): ReturnType<typeof vi.fn> {
  const setSDKProcessingMetadata = vi.fn();
  const scope = { setSDKProcessingMetadata } as unknown as Scope;
  const { req, emit } = makeFakeRequest();

  patchRequestToCaptureBody(req, scope, 'small', 'test');
  // The patch only records chunks when the app itself consumes the body.
  req.on('data', () => {});
  chunks.forEach(chunk => emit('data', Buffer.from(chunk)));
  emit('end');

  return setSDKProcessingMetadata;
}

function expectCapturedBody(spy: ReturnType<typeof vi.fn>, data: unknown): void {
  expect(spy).toHaveBeenCalledWith({ normalizedRequest: { data } });
}

describe('patchRequestToCaptureBody', () => {
  it('filters sensitive keys in a complete JSON body', () => {
    expectCapturedBody(capture(['{"colour":"blue",', '"token":"abc"}']), '{"colour":"blue","token":"[Filtered]"}');
  });

  it('keeps the filter-then-truncate order for a body that overshoots the limit in its final chunk', () => {
    // 9 bytes of prefix + 988 kept characters + `...` = the 1000-byte `small` limit.
    expectCapturedBody(capture([`{"note":"${'x'.repeat(1200)}"}`]), expect.stringMatching(/^\{"note":"x{988}\.\.\.$/));
  });

  it('filters a capped stream wholesale, since the dropped chunks make it unparseable', () => {
    expectCapturedBody(capture([`{"note":"${'x'.repeat(1200)}"}`, '{"more":"data"}']), '[Filtered]');
  });

  it('filters a body that cannot be parsed into key-value pairs', () => {
    expectCapturedBody(capture(['plain text body']), '[Filtered]');
  });

  it('attaches nothing for an empty body', () => {
    expect(capture([])).not.toHaveBeenCalled();
  });
});
