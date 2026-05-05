import { describe, expect, it } from 'vitest';
import { isDurableObjectNamespace, isJSRPC, isQueue } from '../../src/utils/isBinding';

describe('isJSRPC', () => {
  it('returns false for a plain object', () => {
    expect(isJSRPC({ foo: 'bar' })).toBe(false);
  });

  it('returns false for null', () => {
    expect(isJSRPC(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isJSRPC(undefined)).toBe(false);
  });

  it('returns false for primitives', () => {
    expect(isJSRPC(42)).toBe(false);
    expect(isJSRPC('string')).toBe(false);
    expect(isJSRPC(true)).toBe(false);
    expect(isJSRPC(false)).toBe(false);
    expect(isJSRPC(0)).toBe(false);
    expect(isJSRPC('')).toBe(false);
    expect(isJSRPC(BigInt(42))).toBe(false);
    expect(isJSRPC(Symbol('test'))).toBe(false);
  });

  it('returns false for functions, arrays, and other object types', () => {
    expect(isJSRPC(() => {})).toBe(false);
    expect(isJSRPC(function named() {})).toBe(false);
    expect(isJSRPC([1, 2, 3])).toBe(false);
    expect(isJSRPC(new Date())).toBe(false);
    expect(isJSRPC(/regex/)).toBe(false);
    expect(isJSRPC(new Map())).toBe(false);
    expect(isJSRPC(new Set())).toBe(false);
    expect(isJSRPC(new Error('test'))).toBe(false);
  });

  it('returns false for a DurableObjectNamespace-like object', () => {
    const doNamespace = {
      idFromName: () => ({}),
      idFromString: () => ({}),
      get: () => ({}),
      newUniqueId: () => ({}),
    };
    expect(isJSRPC(doNamespace)).toBe(false);
  });

  it('returns true for a JSRPC proxy that returns truthy for any property', () => {
    const jsrpcProxy = new Proxy(
      {},
      {
        get(_target, _prop) {
          return () => {};
        },
      },
    );
    expect(isJSRPC(jsrpcProxy)).toBe(true);
  });
});

describe('isDurableObjectNamespace', () => {
  it('returns true for an object with idFromName method', () => {
    const doNamespace = {
      idFromName: () => ({}),
      idFromString: () => ({}),
      get: () => ({}),
      newUniqueId: () => ({}),
    };
    expect(isDurableObjectNamespace(doNamespace)).toBe(true);
  });

  it('returns false for a plain object without idFromName', () => {
    expect(isDurableObjectNamespace({ foo: 'bar' })).toBe(false);
  });

  it('returns false for null', () => {
    expect(isDurableObjectNamespace(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isDurableObjectNamespace(undefined)).toBe(false);
  });

  it('returns false for primitives', () => {
    expect(isDurableObjectNamespace(42)).toBe(false);
    expect(isDurableObjectNamespace('string')).toBe(false);
    expect(isDurableObjectNamespace(true)).toBe(false);
    expect(isDurableObjectNamespace(false)).toBe(false);
    expect(isDurableObjectNamespace(0)).toBe(false);
    expect(isDurableObjectNamespace('')).toBe(false);
    expect(isDurableObjectNamespace(BigInt(42))).toBe(false);
    expect(isDurableObjectNamespace(Symbol('test'))).toBe(false);
  });

  it('returns false for functions, arrays, and other object types', () => {
    expect(isDurableObjectNamespace(() => {})).toBe(false);
    expect(isDurableObjectNamespace(function named() {})).toBe(false);
    expect(isDurableObjectNamespace([1, 2, 3])).toBe(false);
    expect(isDurableObjectNamespace(new Date())).toBe(false);
    expect(isDurableObjectNamespace(/regex/)).toBe(false);
    expect(isDurableObjectNamespace(new Map())).toBe(false);
    expect(isDurableObjectNamespace(new Set())).toBe(false);
    expect(isDurableObjectNamespace(new Error('test'))).toBe(false);
  });

  it('returns false for a JSRPC proxy even though it has idFromName', () => {
    const jsrpcProxy = new Proxy(
      {},
      {
        get(_target, _prop) {
          return () => {};
        },
      },
    );
    expect(isDurableObjectNamespace(jsrpcProxy)).toBe(false);
  });

  it('returns false when idFromName is not a function', () => {
    expect(isDurableObjectNamespace({ idFromName: 'not-a-function' })).toBe(false);
  });
});

describe('isQueue', () => {
  it('returns true for an object with send and sendBatch methods', () => {
    const queue = {
      send: async () => {},
      sendBatch: async () => {},
    };
    expect(isQueue(queue)).toBe(true);
  });

  it('returns false when send is missing', () => {
    expect(isQueue({ sendBatch: async () => {} })).toBe(false);
  });

  it('returns false when sendBatch is missing', () => {
    expect(isQueue({ send: async () => {} })).toBe(false);
  });

  it('returns false when send is not a function', () => {
    expect(isQueue({ send: 'nope', sendBatch: async () => {} })).toBe(false);
  });

  it('returns false for null and undefined', () => {
    expect(isQueue(null)).toBe(false);
    expect(isQueue(undefined)).toBe(false);
  });

  it('returns false for a JSRPC proxy even though it returns functions for send/sendBatch', () => {
    const jsrpcProxy = new Proxy(
      {},
      {
        get(_target, _prop) {
          return () => {};
        },
      },
    );
    expect(isQueue(jsrpcProxy)).toBe(false);
  });

  it('returns false for a DurableObjectNamespace-like object', () => {
    const doNamespace = {
      idFromName: () => ({}),
      idFromString: () => ({}),
      get: () => ({}),
      newUniqueId: () => ({}),
    };
    expect(isQueue(doNamespace)).toBe(false);
  });
});
