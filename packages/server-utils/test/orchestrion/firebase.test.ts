import type { Span } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { getPortAndAddress, startFirestoreSpan } from '../../src/integrations/firebase/firestore';
import type { FirestoreReference } from '../../src/integrations/firebase/firestore-types';
import { wrapFunctionsRegistration } from '../../src/integrations/firebase/functions';

function makeSpan(): Span {
  return { end: vi.fn(), setStatus: vi.fn(), setAttributes: vi.fn() } as unknown as Span;
}

// A minimal Firestore reference shaped like what `addDoc`/`getDocs`/... receive as `arguments[0]`.
function makeReference(path: string, type: string, host = 'localhost:8080'): FirestoreReference {
  const firestore = {
    app: {
      name: '[DEFAULT]',
      options: {
        projectId: 'sentry-15d85',
        appId: 'app-id',
        messagingSenderId: 'sender-id',
        storageBucket: 'bucket',
      },
    },
    toJSON: () => ({ settings: { host } }),
  };
  return { id: 'ref-id', path, type, parent: null, firestore } as unknown as FirestoreReference;
}

describe('startFirestoreSpan', () => {
  let startInactiveSpanSpy: MockInstance;

  beforeEach(() => {
    startInactiveSpanSpy = vi.spyOn(SentryCore, 'startInactiveSpan').mockReturnValue(makeSpan());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds a `db.query` span from the collection reference with the orchestrion origin', () => {
    startFirestoreSpan('addDoc', makeReference('cities', 'collection'));

    expect(startInactiveSpanSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'addDoc cities',
        op: 'db.query',
        attributes: expect.objectContaining({
          'sentry.origin': 'auto.firebase.firestore',
          'db.operation.name': 'addDoc',
          'db.collection.name': 'cities',
          'db.namespace': '[DEFAULT]',
          'db.system.name': 'firebase.firestore',
          'firebase.firestore.type': 'collection',
          'firebase.firestore.options.projectId': 'sentry-15d85',
          'server.address': 'localhost',
          'server.port': 8080,
        }),
      }),
    );
  });

  it('names the span after the operation and the queried reference', () => {
    startFirestoreSpan('getDocs', makeReference('cities', 'collection'));

    expect(startInactiveSpanSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'getDocs cities', op: 'db.query' }),
    );
  });
});

describe('wrapFunctionsRegistration', () => {
  let startSpanManualSpy: MockInstance;
  let captureExceptionSpy: MockInstance;
  let span: Span;

  beforeEach(() => {
    span = makeSpan();
    // Drive the callback with a fake span so we can assert the span lifecycle.
    startSpanManualSpy = vi
      .spyOn(SentryCore, 'startSpanManual')
      .mockImplementation((_options: unknown, callback: unknown) => (callback as (s: Span) => unknown)(span));
    captureExceptionSpy = vi.spyOn(SentryCore, 'captureException').mockImplementation(() => 'id');
    vi.spyOn(SentryCore, 'flush').mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // `wrapFunctionsRegistration` mutates the args array in place; read the wrapped handler back out.
  function wrapAndGetHandler(args: unknown[], triggerType: string): (...a: unknown[]) => unknown {
    wrapFunctionsRegistration({ arguments: args }, triggerType);
    const handlerIndex = typeof args[0] === 'function' ? 0 : 1;
    return args[handlerIndex] as (...a: unknown[]) => unknown;
  }

  it('rewraps the handler and opens a SERVER span with the orchestrion origin on invocation', async () => {
    const original = vi.fn().mockResolvedValue('ok');
    const wrapped = wrapAndGetHandler([original], 'http.request');

    expect(wrapped).not.toBe(original);

    const result = await wrapped('req', 'res');

    expect(result).toBe('ok');
    expect(original).toHaveBeenCalledWith('req', 'res');
    expect(startSpanManualSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'firebase.function.http.request',
        attributes: expect.objectContaining({
          'sentry.origin': 'auto.firebase.functions',
          'sentry.op': 'function.gcp',
          'faas.trigger': 'http.request',
          'faas.provider': 'firebase',
        }),
      }),
      expect.any(Function),
    );
    expect(span.end).toHaveBeenCalledTimes(1);
  });

  it('handles the `(document, handler)` signature', async () => {
    const original = vi.fn().mockResolvedValue(undefined);
    const wrapped = wrapAndGetHandler(['cities/{cityId}', original], 'firestore.document.created');

    await wrapped({ some: 'event' });

    expect(original).toHaveBeenCalledWith({ some: 'event' });
    expect(startSpanManualSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'firebase.function.firestore.document.created',
        attributes: expect.objectContaining({ 'faas.trigger': 'firestore.document.created' }),
      }),
      expect.any(Function),
    );
  });

  it('captures the error, ends the span, and rethrows when the handler throws', async () => {
    const error = new Error('handler failed');
    const original = vi.fn().mockRejectedValue(error);
    const wrapped = wrapAndGetHandler([original], 'http.call');

    await expect(wrapped()).rejects.toThrow('handler failed');

    expect(span.setStatus).toHaveBeenCalledWith({ code: expect.anything() });
    expect(captureExceptionSpy).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        mechanism: expect.objectContaining({ type: 'auto.firebase.functions' }),
      }),
    );
    expect(span.end).toHaveBeenCalledTimes(1);
  });

  it('does not double-wrap an already-wrapped handler', () => {
    const original = vi.fn();
    const wrappedOnce = wrapAndGetHandler([original], 'http.request');

    const args = [wrappedOnce];
    wrapFunctionsRegistration({ arguments: args }, 'http.request');

    expect(args[0]).toBe(wrappedOnce);
  });
});

describe('getPortAndAddress', () => {
  describe('IPv6 addresses', () => {
    it('parses an IPv6 address without a port', () => {
      const { address, port } = getPortAndAddress({ host: '[2001:db8::1]' });

      expect(address).toBe('2001:db8::1');
      expect(port).toBeUndefined();
    });

    it('parses an IPv6 address with a port', () => {
      const { address, port } = getPortAndAddress({ host: '[2001:db8::1]:8080' });

      expect(address).toBe('2001:db8::1');
      expect(port).toBe(8080);
    });

    it('parses IPv6 localhost without a port', () => {
      const { address, port } = getPortAndAddress({ host: '[::1]' });

      expect(address).toBe('::1');
      expect(port).toBeUndefined();
    });

    it('parses IPv6 localhost with a port', () => {
      const { address, port } = getPortAndAddress({ host: '[::1]:3000' });

      expect(address).toBe('::1');
      expect(port).toBe(3000);
    });
  });

  describe('IPv4 and hostname addresses', () => {
    it('parses an IPv4 address with a port', () => {
      const { address, port } = getPortAndAddress({ host: '192.168.1.1:8080' });

      expect(address).toBe('192.168.1.1');
      expect(port).toBe(8080);
    });

    it('parses a hostname with a port', () => {
      const { address, port } = getPortAndAddress({ host: 'localhost:3000' });

      expect(address).toBe('localhost');
      expect(port).toBe(3000);
    });

    it('parses a hostname without a port', () => {
      const { address, port } = getPortAndAddress({ host: 'example.com' });

      expect(address).toBe('example.com');
      expect(port).toBeUndefined();
    });

    it('parses a fully-qualified hostname with a port', () => {
      const { address, port } = getPortAndAddress({ host: 'example.com:4000' });

      expect(address).toBe('example.com');
      expect(port).toBe(4000);
    });

    it('handles an empty host string', () => {
      const { address, port } = getPortAndAddress({ host: '' });

      expect(address).toBe('');
      expect(port).toBeUndefined();
    });

    it('returns no address or port when host is absent', () => {
      const { address, port } = getPortAndAddress({});

      expect(address).toBeUndefined();
      expect(port).toBeUndefined();
    });
  });
});
