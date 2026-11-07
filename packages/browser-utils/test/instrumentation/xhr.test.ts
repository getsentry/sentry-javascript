import { afterEach, describe, expect, it, vi } from 'vitest';
import { addXhrInstrumentationHandler, instrumentXHR } from '../../src/instrumentation/xhr';
import type { HandlerDataXhr, SentryWrappedXMLHttpRequest } from '../../src/types';
import { WINDOW } from '../../src/types';

const win = WINDOW as typeof WINDOW & { XMLHttpRequest?: typeof XMLHttpRequest };
const originalXMLHttpRequest = win.XMLHttpRequest;

function openWithUrl(url: unknown): SentryWrappedXMLHttpRequest['__sentry_xhr_v3__'] {
  class MockXMLHttpRequest {
    public addEventListener(): void {}
    public removeEventListener(): void {}
    public open(_method: string, _url: string): void {}
    public send(): void {}
    public setRequestHeader(_header: string, _value: string): void {}
  }

  win.XMLHttpRequest = MockXMLHttpRequest as unknown as typeof XMLHttpRequest;
  instrumentXHR();

  const xhr = new MockXMLHttpRequest();
  xhr.open('GET', url as string);
  return (xhr as unknown as SentryWrappedXMLHttpRequest).__sentry_xhr_v3__;
}

describe('instrumentXHR', () => {
  afterEach(() => {
    win.XMLHttpRequest = originalXMLHttpRequest;
  });

  it('does not throw if XMLHttpRequest is a key on window but not defined', () => {
    win.XMLHttpRequest = undefined;
    expect(instrumentXHR).not.toThrow();
  });

  it('instruments requests with an empty URL', () => {
    expect(openWithUrl('')).toMatchObject({ method: 'GET', url: '' });
  });

  it('does not instrument requests whose URL cannot be parsed', () => {
    expect(openWithUrl(undefined)).toBeUndefined();
  });

  it('removes readystatechange event listener on readyState 4 when registered with addEventListener', () => {
    const addEventListenerSpy = vi.fn();
    const removeEventListenerSpy = vi.fn();

    class MockXMLHttpRequest {
      public readyState: number = 0;
      public status: number = 200;
      public addEventListener = addEventListenerSpy;
      public removeEventListener = removeEventListenerSpy;
      public open(_method: string, _url: string): void {}
      public send(): void {}
      public setRequestHeader(_header: string, _value: string): void {}
    }

    win.XMLHttpRequest = MockXMLHttpRequest as unknown as typeof XMLHttpRequest;

    instrumentXHR();

    const xhr = new MockXMLHttpRequest();
    xhr.open('GET', 'http://example.com');

    expect(addEventListenerSpy).toHaveBeenCalledWith('readystatechange', expect.any(Function));
    const handler = addEventListenerSpy.mock.calls[0]?.[1] as (this: MockXMLHttpRequest) => void;

    xhr.readyState = 2;
    handler.call(xhr);
    expect(removeEventListenerSpy).not.toHaveBeenCalled();

    xhr.readyState = 4;
    handler.call(xhr);
    expect(removeEventListenerSpy).toHaveBeenCalledWith('readystatechange', handler);
  });

  it('still reports the xhr completion (with endTimestamp) after removing the listener', () => {
    const addEventListenerSpy = vi.fn();
    const removeEventListenerSpy = vi.fn();

    class MockXMLHttpRequest {
      public readyState: number = 0;
      public status: number = 200;
      public addEventListener = addEventListenerSpy;
      public removeEventListener = removeEventListenerSpy;
      public open(_method: string, _url: string): void {}
      public send(): void {}
      public setRequestHeader(_header: string, _value: string): void {}
    }

    win.XMLHttpRequest = MockXMLHttpRequest as unknown as typeof XMLHttpRequest;

    const instrumentationHandler = vi.fn();
    addXhrInstrumentationHandler(instrumentationHandler);
    instrumentXHR();

    const xhr = new MockXMLHttpRequest();
    xhr.open('GET', 'http://example.com');

    const handler = addEventListenerSpy.mock.calls[0]?.[1] as (this: MockXMLHttpRequest) => void;

    xhr.readyState = 4;
    handler.call(xhr);

    const completionCall = instrumentationHandler.mock.calls.find(
      ([data]: [HandlerDataXhr]) => data.endTimestamp !== undefined,
    );
    expect(completionCall).toBeDefined();
    expect(completionCall?.[0].startTimestamp).toBeDefined();

    // completion must be reported before we detach the listener, so a throwing
    // `removeEventListener` could never silently drop the completion event
    const completionOrder = Math.min(...instrumentationHandler.mock.invocationCallOrder);
    expect(removeEventListenerSpy.mock.invocationCallOrder[0]).toBeGreaterThan(completionOrder);
  });

  it('does not remove a listener via addEventListener when onreadystatechange is used', () => {
    const addEventListenerSpy = vi.fn();
    const removeEventListenerSpy = vi.fn();

    class MockXMLHttpRequest {
      public readyState: number = 0;
      public status: number = 200;
      public onreadystatechange: (() => void) | null = null;
      public addEventListener = addEventListenerSpy;
      public removeEventListener = removeEventListenerSpy;
      public open(_method: string, _url: string): void {}
      public send(): void {}
      public setRequestHeader(_header: string, _value: string): void {}
    }

    win.XMLHttpRequest = MockXMLHttpRequest as unknown as typeof XMLHttpRequest;

    const handlerData: HandlerDataXhr[] = [];
    addXhrInstrumentationHandler(data => {
      handlerData.push(data);
    });
    instrumentXHR();

    const xhr = new MockXMLHttpRequest();
    const originalOnReadyStateChange = vi.fn();
    xhr.onreadystatechange = originalOnReadyStateChange;
    xhr.open('GET', 'http://example.com');

    // onreadystatechange path must not register a separate readystatechange listener
    expect(addEventListenerSpy).not.toHaveBeenCalled();

    // the SDK wraps the user's handler rather than replacing it
    expect(xhr.onreadystatechange).not.toBe(originalOnReadyStateChange);

    xhr.readyState = 4;
    xhr.onreadystatechange?.();

    // the user's original handler still runs and completion is still reported
    expect(originalOnReadyStateChange).toHaveBeenCalledTimes(1);
    expect(handlerData.some(data => data.endTimestamp !== undefined)).toBe(true);
  });
});
