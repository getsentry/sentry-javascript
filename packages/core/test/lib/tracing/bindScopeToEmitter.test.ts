import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentScope, getGlobalScope, getIsolationScope, setCurrentClient, withScope } from '../../../src';
import { Scope } from '../../../src/scope';
import { bindScopeToEmitter } from '../../../src/tracing/bindScopeToEmitter';
import { startInactiveSpan, withActiveSpan } from '../../../src/tracing/trace';
import { getActiveSpan } from '../../../src/utils/spanUtils';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

describe('bindScopeToEmitter', () => {
  beforeEach(() => {
    getCurrentScope().clear();
    getIsolationScope().clear();
    getGlobalScope().clear();

    const client = new TestClient(getDefaultTestClientOptions({ tracesSampleRate: 1 }));
    setCurrentClient(client);
    client.init();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('runs listeners added after binding with the scope active at bind time', () => {
    const emitter = new EventEmitter();

    let boundScope: Scope | undefined;
    withScope(scope => {
      boundScope = scope;
      bindScopeToEmitter(emitter);
    });

    // The listener is registered *outside* the `withScope`, yet should see the bound scope.
    let scopeInListener: Scope | undefined;
    emitter.on('data', () => {
      scopeInListener = getCurrentScope();
    });

    emitter.emit('data');

    expect(scopeInListener).toBe(boundScope);
    expect(scopeInListener).not.toBe(getCurrentScope());
  });

  it('binds an explicitly passed scope instead of the current one', () => {
    const emitter = new EventEmitter();

    const explicitScope = new Scope();
    bindScopeToEmitter(emitter, explicitScope);

    let scopeInListener: Scope | undefined;
    emitter.on('data', () => {
      scopeInListener = getCurrentScope();
    });

    emitter.emit('data');

    expect(scopeInListener).toBe(explicitScope);
    expect(scopeInListener).not.toBe(getCurrentScope());
  });

  it('prefers the explicitly passed scope over the active scope at call time', () => {
    const emitter = new EventEmitter();

    const explicitScope = new Scope();
    withScope(activeScope => {
      // Bind a *different* scope than the one that is currently active.
      expect(activeScope).not.toBe(explicitScope);
      bindScopeToEmitter(emitter, explicitScope);
    });

    let scopeInListener: Scope | undefined;
    emitter.on('data', () => {
      scopeInListener = getCurrentScope();
    });

    emitter.emit('data');

    expect(scopeInListener).toBe(explicitScope);
  });

  it('preserves the active span for listeners', () => {
    const emitter = new EventEmitter();

    const span = startInactiveSpan({ name: 'parent' });
    withActiveSpan(span, () => {
      bindScopeToEmitter(emitter);
    });

    let activeSpanInListener: ReturnType<typeof getActiveSpan>;
    emitter.on('end', () => {
      activeSpanInListener = getActiveSpan();
    });

    expect(getActiveSpan()).toBeUndefined();
    emitter.emit('end');

    expect(activeSpanInListener).toBe(span);
  });

  it.each(['on', 'addListener', 'prependListener'] as const)('binds the scope for listeners added via %s', method => {
    const emitter = new EventEmitter();

    let boundScope: Scope | undefined;
    withScope(scope => {
      boundScope = scope;
      bindScopeToEmitter(emitter);
    });

    let scopeInListener: Scope | undefined;
    emitter[method]('data', () => {
      scopeInListener = getCurrentScope();
    });

    emitter.emit('data');

    expect(scopeInListener).toBe(boundScope);
  });

  it('binds the scope for `once` listeners and only fires them once', () => {
    const emitter = new EventEmitter();

    let boundScope: Scope | undefined;
    withScope(scope => {
      boundScope = scope;
      bindScopeToEmitter(emitter);
    });

    const listener = vi.fn(() => getCurrentScope());
    emitter.once('data', listener);

    emitter.emit('data');
    emitter.emit('data');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveReturnedWith(boundScope);
  });

  it('removes the wrapped listener when removing via the original reference', () => {
    const emitter = new EventEmitter();
    bindScopeToEmitter(emitter);

    const listener = vi.fn();
    emitter.on('data', listener);
    emitter.removeListener('data', listener);

    emitter.emit('data');

    expect(listener).not.toHaveBeenCalled();
    expect(emitter.listenerCount('data')).toBe(0);
  });

  it('handles the same listener registered multiple times for one event', () => {
    const emitter = new EventEmitter();
    bindScopeToEmitter(emitter);

    const listener = vi.fn();
    emitter.on('data', listener);
    emitter.on('data', listener);
    expect(emitter.listenerCount('data')).toBe(2);

    emitter.emit('data');
    expect(listener).toHaveBeenCalledTimes(2);

    // Each `removeListener` must remove a distinct registration — neither wrapper may be orphaned.
    emitter.removeListener('data', listener);
    expect(emitter.listenerCount('data')).toBe(1);
    emitter.removeListener('data', listener);
    expect(emitter.listenerCount('data')).toBe(0);

    listener.mockClear();
    emitter.emit('data');
    expect(listener).not.toHaveBeenCalled();
  });

  it('handles a mix of `once` and `on` registrations of the same listener', () => {
    const emitter = new EventEmitter();
    bindScopeToEmitter(emitter);

    const listener = vi.fn();
    emitter.once('data', listener);
    emitter.on('data', listener);
    expect(emitter.listenerCount('data')).toBe(2);

    // First emit fires both; the `once` registration removes itself.
    emitter.emit('data');
    expect(listener).toHaveBeenCalledTimes(2);
    expect(emitter.listenerCount('data')).toBe(1);

    // The remaining `on` registration is still removable via the original reference.
    emitter.removeListener('data', listener);
    expect(emitter.listenerCount('data')).toBe(0);
  });

  it('removes the wrapped listener via `off`', () => {
    const emitter = new EventEmitter();
    bindScopeToEmitter(emitter);

    const listener = vi.fn();
    emitter.on('data', listener);
    emitter.off('data', listener);

    emitter.emit('data');

    expect(listener).not.toHaveBeenCalled();
  });

  it('supports removeAllListeners', () => {
    const emitter = new EventEmitter();

    let boundScope: Scope | undefined;
    withScope(scope => {
      boundScope = scope;
      bindScopeToEmitter(emitter);
    });

    const a = vi.fn();
    const b = vi.fn();
    emitter.on('data', a);
    emitter.on('end', b);

    emitter.removeAllListeners('data');
    emitter.emit('data');
    expect(a).not.toHaveBeenCalled();

    // listeners added after a targeted removeAllListeners are still bound and fire
    let scopeInListener: Scope | undefined;
    emitter.on('data', () => {
      scopeInListener = getCurrentScope();
    });
    emitter.emit('data');
    expect(scopeInListener).toBe(boundScope);

    emitter.removeAllListeners();
    emitter.emit('end');
    expect(b).not.toHaveBeenCalled();
  });

  it('does not double-wrap when binding the same emitter twice', () => {
    const emitter = new EventEmitter();

    const first = bindScopeToEmitter(emitter);
    const second = bindScopeToEmitter(emitter);

    expect(first).toBe(emitter);
    expect(second).toBe(emitter);

    const listener = vi.fn();
    emitter.on('data', listener);
    emitter.emit('data');

    // Listener fires exactly once per emit (not multiple times due to double wrapping).
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('preserves the emitter return value for chaining', () => {
    const emitter = new EventEmitter();
    bindScopeToEmitter(emitter);

    const result = emitter.on('a', () => {}).on('b', () => {});
    expect(result).toBe(emitter);
  });

  it('passes through objects that are not event emitters', () => {
    const obj = { foo: 'bar' };
    expect(bindScopeToEmitter(obj)).toBe(obj);
  });

  describe('DOM EventTarget', () => {
    it('binds the scope for listeners added via addEventListener', () => {
      const target = new EventTarget();

      let boundScope: Scope | undefined;
      withScope(scope => {
        boundScope = scope;
        bindScopeToEmitter(target);
      });

      let scopeInListener: Scope | undefined;
      target.addEventListener('data', () => {
        scopeInListener = getCurrentScope();
      });

      target.dispatchEvent(new Event('data'));

      expect(scopeInListener).toBe(boundScope);
    });

    it('removes the wrapped listener via removeEventListener', () => {
      const target = new EventTarget();
      bindScopeToEmitter(target);

      const listener = vi.fn();
      target.addEventListener('data', listener);
      target.removeEventListener('data', listener);

      target.dispatchEvent(new Event('data'));

      expect(listener).not.toHaveBeenCalled();
    });

    it('forwards the options argument (e.g. `once`)', () => {
      const target = new EventTarget();
      bindScopeToEmitter(target);

      const listener = vi.fn();
      target.addEventListener('data', listener, { once: true });

      target.dispatchEvent(new Event('data'));
      target.dispatchEvent(new Event('data'));

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('passes through non-function (EventListener object) listeners without throwing', () => {
      const target = new EventTarget();
      bindScopeToEmitter(target);

      const handleEvent = vi.fn();
      const listenerObject = { handleEvent };
      target.addEventListener('data', listenerObject);

      expect(() => target.dispatchEvent(new Event('data'))).not.toThrow();
      expect(handleEvent).toHaveBeenCalledTimes(1);
    });
  });

  it('forwards `this` and arguments to the original listener', () => {
    const emitter = new EventEmitter();
    bindScopeToEmitter(emitter);

    const listener = vi.fn();
    emitter.on('data', listener);
    emitter.emit('data', 1, 'two', { three: true });

    expect(listener).toHaveBeenCalledWith(1, 'two', { three: true });
    // EventEmitter invokes listeners with `this` bound to the emitter.
    expect(listener.mock.instances[0]).toBe(emitter);
  });
});
