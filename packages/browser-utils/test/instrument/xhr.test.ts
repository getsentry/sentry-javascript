import { afterEach, describe, expect, it, vi } from 'vitest';
import { instrumentXHR } from '../../src/instrument/xhr';
import { WINDOW } from '../../src/types';

const win = WINDOW as typeof WINDOW & { XMLHttpRequest?: typeof XMLHttpRequest };
const originalXMLHttpRequest = win.XMLHttpRequest;

describe('instrumentXHR', () => {
  afterEach(() => {
    win.XMLHttpRequest = originalXMLHttpRequest;
  });

  it('does not throw if XMLHttpRequest is a key on window but not defined', () => {
    win.XMLHttpRequest = undefined;
    expect(instrumentXHR).not.toThrow();
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
});
