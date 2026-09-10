import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it } from 'vitest';
import { instrumentXHR } from '../../src/instrumentation/xhr';
import { WINDOW } from '../../src/types';

// This lives in its own file on purpose: instrumentation handlers are registered in a module-level
// registry that is never torn down, and a handler from another test would hold on to the requests
// this one needs to see collected.

const win = WINDOW as typeof WINDOW & { XMLHttpRequest?: typeof XMLHttpRequest };
const originalXMLHttpRequest = win.XMLHttpRequest;

function collectGarbage(): void {
  setFlagsFromString('--expose-gc');
  const gc = runInNewContext('gc') as () => void;
  setFlagsFromString('--no-expose-gc');
  gc();
  gc();
}

class MockXMLHttpRequest {
  public readyState: number = 0;
  public status: number = 200;
  private _listeners: Array<() => void> = [];

  public addEventListener(_type: string, listener: () => void): void {
    this._listeners.push(listener);
  }

  public removeEventListener(_type: string, listener: () => void): void {
    this._listeners = this._listeners.filter(registered => registered !== listener);
  }

  public dispatch(): void {
    // the SDK detaches its own listener while it runs, so iterate over a copy
    for (const listener of this._listeners.slice()) {
      // the browser invokes readystatechange listeners with the request as `this`, which is what
      // puts the request into the stack frames of anything the listener calls
      listener.call(this);
    }
  }

  public open(_method: string, _url: string): void {}
  public send(): void {}
  public setRequestHeader(_header: string, _value: string): void {}
}

describe('instrumentXHR memory retention', () => {
  afterEach(() => {
    win.XMLHttpRequest = originalXMLHttpRequest;
  });

  it('does not retain completed requests that were chained from readystatechange', async () => {
    win.XMLHttpRequest = MockXMLHttpRequest as unknown as typeof XMLHttpRequest;
    instrumentXHR();

    let firstRequest: WeakRef<MockXMLHttpRequest> | undefined;
    // the request that never finishes stands in for the one in flight, which the browser keeps
    // alive as a pending activity and which therefore roots the chain
    let inFlightRequest: MockXMLHttpRequest | undefined;

    const openRequest = (remaining: number): void => {
      const xhr = new MockXMLHttpRequest();
      xhr.open('GET', 'http://example.com');

      if (!firstRequest) {
        firstRequest = new WeakRef(xhr);
      }

      if (remaining === 0) {
        inFlightRequest = xhr;
        return;
      }

      xhr.addEventListener('readystatechange', function (this: MockXMLHttpRequest) {
        if (this.readyState === 4) {
          openRequest(remaining - 1);
        }
      });

      xhr.readyState = 4;
      xhr.dispatch();
    };

    openRequest(4);

    // a WeakRef created in the current job is never cleared during that job
    await new Promise(resolve => setTimeout(resolve, 0));
    collectGarbage();

    expect(inFlightRequest).toBeDefined();
    expect(firstRequest?.deref()).toBeUndefined();
  });
});
