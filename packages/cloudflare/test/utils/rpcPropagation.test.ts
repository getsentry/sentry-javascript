import { describe, expect, it } from 'vitest';
import { createRpcPropagationResolver } from '../../src/utils/rpcPropagation';

describe('createRpcPropagationResolver', () => {
  it('propagates to nothing when no options are available', () => {
    const shouldPropagate = createRpcPropagationResolver(undefined);

    expect(shouldPropagate('MY_DO')).toBe(false);
  });

  it('propagates to nothing when the option is unset', () => {
    const shouldPropagate = createRpcPropagationResolver({ rpcTracePropagationBindings: undefined });

    expect(shouldPropagate('MY_DO')).toBe(false);
    expect(shouldPropagate('EXTERNAL')).toBe(false);
  });

  it('falls back to enableRpcTracePropagation when no bindings are listed', () => {
    // eslint-disable-next-line typescript/no-deprecated
    const shouldPropagate = createRpcPropagationResolver({ enableRpcTracePropagation: true });

    expect(shouldPropagate('MY_DO')).toBe(true);
    expect(shouldPropagate('EXTERNAL')).toBe(true);
  });

  it('falls back to instrumentPrototypeMethods when no bindings are listed', () => {
    // eslint-disable-next-line typescript/no-deprecated
    const shouldPropagate = createRpcPropagationResolver({ instrumentPrototypeMethods: true });

    expect(shouldPropagate('MY_DO')).toBe(true);
  });

  it('lets the binding list win over enableRpcTracePropagation', () => {
    const shouldPropagate = createRpcPropagationResolver({
      // eslint-disable-next-line typescript/no-deprecated
      enableRpcTracePropagation: true,
      rpcTracePropagationBindings: ['MY_DO'],
    });

    expect(shouldPropagate('MY_DO')).toBe(true);
    expect(shouldPropagate('EXTERNAL')).toBe(false);
  });

  it('propagates to nothing for an empty target list', () => {
    const shouldPropagate = createRpcPropagationResolver({ rpcTracePropagationBindings: [] });

    expect(shouldPropagate('MY_DO')).toBe(false);
  });

  it('propagates only to the targeted binding names', () => {
    const shouldPropagate = createRpcPropagationResolver({ rpcTracePropagationBindings: ['MY_DO', 'EXTERNAL'] });

    expect(shouldPropagate('MY_DO')).toBe(true);
    expect(shouldPropagate('EXTERNAL')).toBe(true);
    expect(shouldPropagate('OTHER')).toBe(false);
  });

  it('matches binding names exactly, never as a substring', () => {
    const shouldPropagate = createRpcPropagationResolver({ rpcTracePropagationBindings: ['DB'] });

    expect(shouldPropagate('DB')).toBe(true);
    expect(shouldPropagate('MY_DB')).toBe(false);
    expect(shouldPropagate('DB_REPLICA')).toBe(false);
  });

  it('supports regular expressions for pattern matching', () => {
    const shouldPropagate = createRpcPropagationResolver({ rpcTracePropagationBindings: [/^SVC_/] });

    expect(shouldPropagate('SVC_ORDERS')).toBe(true);
    expect(shouldPropagate('SVC_USERS')).toBe(true);
    expect(shouldPropagate('ORDERS')).toBe(false);
    expect(shouldPropagate('PREFIXED_SVC_ORDERS')).toBe(false);
  });
});
