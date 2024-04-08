import {
  Scope,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  setCapturedScopesOnSpan,
  startSpan,
} from '@sentry/core';
import { init } from '@sentry/node';
import { GLOBAL_OBJ } from '@sentry/utils';
import { AsyncLocalStorage } from 'async_hooks';

import { withIsolationScopeOrReuseFromRootSpan } from '../../src/common/utils/withIsolationScopeOrReuseFromRootSpan';

describe('withIsolationScopeOrReuseFromRootSpan', () => {
  beforeEach(() => {
    getIsolationScope().clear();
    getCurrentScope().clear();
    getGlobalScope().clear();
    (GLOBAL_OBJ as any).AsyncLocalStorage = AsyncLocalStorage;

    init({
      enableTracing: true,
    });
  });

  it('works without any span', () => {
    const initialIsolationScope = getIsolationScope();
    initialIsolationScope.setTag('aa', 'aa');

    withIsolationScopeOrReuseFromRootSpan(isolationScope => {
      isolationScope.setTag('bb', 'bb');
      expect(isolationScope).not.toBe(initialIsolationScope);
      expect(isolationScope.getScopeData().tags).toEqual({ aa: 'aa', bb: 'bb' });
    });
  });

  it('works with a non-next.js span', () => {
    const initialIsolationScope = getIsolationScope();
    initialIsolationScope.setTag('aa', 'aa');

    const customScope = new Scope();

    startSpan({ name: 'other' }, span => {
      setCapturedScopesOnSpan(span, getCurrentScope(), customScope);

      withIsolationScopeOrReuseFromRootSpan(isolationScope => {
        isolationScope.setTag('bb', 'bb');
        expect(isolationScope).not.toBe(initialIsolationScope);
        expect(isolationScope.getScopeData().tags).toEqual({ aa: 'aa', bb: 'bb' });
      });
    });
  });

  it('works with a next.js span', () => {
    const initialIsolationScope = getIsolationScope();
    initialIsolationScope.setTag('aa', 'aa');

    const customScope = new Scope();

    startSpan(
      {
        name: 'other',
        attributes: { 'next.route': 'aha' },
      },
      span => {
        setCapturedScopesOnSpan(span, getCurrentScope(), customScope);

        withIsolationScopeOrReuseFromRootSpan(isolationScope => {
          isolationScope.setTag('bb', 'bb');
          expect(isolationScope).toBe(customScope);
          expect(isolationScope.getScopeData().tags).toEqual({ bb: 'bb' });
        });
      },
    );
  });

  it('works with a next.js span that has default isolation scope', () => {
    const initialIsolationScope = getIsolationScope();
    initialIsolationScope.setTag('aa', 'aa');

    startSpan(
      {
        name: 'other',
        attributes: { 'next.route': 'aha' },
      },
      () => {
        withIsolationScopeOrReuseFromRootSpan(isolationScope => {
          isolationScope.setTag('bb', 'bb');
          expect(isolationScope).not.toBe(initialIsolationScope);
          expect(isolationScope.getScopeData().tags).toEqual({ aa: 'aa', bb: 'bb' });
        });
      },
    );
  });
});
