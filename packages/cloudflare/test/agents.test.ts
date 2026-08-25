import { afterEach, describe, expect, it, vi } from 'vitest';
import { instrumentAgentWithSentry } from '../src';
import { getInstrumented } from '../src/instrument';

describe('instrumentAgentWithSentry', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('instruments the built-in Durable Object handlers (Agent extends DurableObject)', () => {
    const testClass = class {
      fetch() {}
      alarm() {}
      webSocketMessage() {}
      webSocketClose() {}
      webSocketError() {}
    };

    const instrumented = instrumentAgentWithSentry(vi.fn().mockReturnValue({}), testClass as any);
    const obj = Reflect.construct(instrumented, []);

    for (const methodName of ['fetch', 'alarm', 'webSocketMessage', 'webSocketClose', 'webSocketError']) {
      expect(getInstrumented((obj as any)[methodName]), `Method ${methodName} is instrumented`).toBeTruthy();
    }
  });

  it('wraps the Agent-specific handlers as own-properties on the constructed instance', () => {
    const testClass = class {
      fetch() {}
      onMessage() {}
    };
    const proto = testClass.prototype as any;

    const instrumented = instrumentAgentWithSentry(vi.fn().mockReturnValue({}), testClass as any);
    const obj = Reflect.construct(instrumented, []) as any;

    // `instrumentCloudflareAgent` replaces each handler with a wrapper stored as an own-property,
    // so the instance's copy is a distinct function from the untouched prototype method.
    for (const methodName of ['onMessage']) {
      expect(Object.prototype.hasOwnProperty.call(obj, methodName), `${methodName} is an own-property`).toBe(true);
      expect(obj[methodName], `${methodName} differs from the prototype original`).not.toBe(proto[methodName]);
    }
  });

  it('keeps RPC methods on the prototype callable while wrapping Agent handlers as own-properties', () => {
    const testClass = class {
      fetch() {}
      onMessage() {}
      onChatMessage() {}
      rpcMethod() {
        return 'rpc';
      }
    };

    const instrumented = instrumentAgentWithSentry(
      vi.fn().mockReturnValue({ enableRpcTracePropagation: true }),
      testClass as any,
    );
    const obj = Reflect.construct(instrumented, []);

    // Agent-specific handlers become own properties, so they are excluded from RPC method tracing.
    expect(Object.prototype.hasOwnProperty.call(obj, 'onMessage')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(obj, 'onChatMessage')).toBe(true);

    // RPC methods remain on the prototype and still work through the proxy.
    expect(Object.prototype.hasOwnProperty.call(obj, 'rpcMethod')).toBe(false);
    expect((obj as any).rpcMethod()).toBe('rpc');
  });
});
