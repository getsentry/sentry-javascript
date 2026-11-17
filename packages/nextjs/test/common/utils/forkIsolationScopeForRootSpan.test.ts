import { getCapturedScopesOnSpan, getIsolationScope, SentrySpan, startSpan, withActiveSpan } from '@sentry/core';
import { describe, expect, it } from 'vitest';
import { ATTR_NEXT_SPAN_TYPE } from '../../../src/common/nextSpanAttributes';
import { maybeForkIsolationScopeForRootSpan } from '../../../src/common/utils/forkIsolationScopeForRootSpan';

describe('maybeForkIsolationScopeForRootSpan', () => {
  it.each(['BaseServer.handleRequest', 'Middleware.execute', 'Next.request'])(
    'forks the isolation scope for %s root spans',
    spanType => {
      const span = new SentrySpan({ name: 'GET' });
      const isolationScope = getIsolationScope();

      maybeForkIsolationScopeForRootSpan(span, { [ATTR_NEXT_SPAN_TYPE]: spanType });

      const forkedIsolationScope = getCapturedScopesOnSpan(span).isolationScope;
      expect(forkedIsolationScope).toBeDefined();
      expect(forkedIsolationScope).not.toBe(isolationScope);
    },
  );

  it('does not fork the isolation scope for other span types', () => {
    const span = new SentrySpan({ name: 'render' });

    maybeForkIsolationScopeForRootSpan(span, { [ATTR_NEXT_SPAN_TYPE]: 'Render.getServerSideProps' });

    expect(getCapturedScopesOnSpan(span).isolationScope).toBeUndefined();
  });

  it('does not fork the isolation scope for non-root spans', () => {
    const rootSpan = new SentrySpan({ name: 'GET' });

    withActiveSpan(rootSpan, () => {
      startSpan({ name: 'middleware GET' }, childSpan => {
        const isolationScopeBefore = getCapturedScopesOnSpan(childSpan).isolationScope;

        maybeForkIsolationScopeForRootSpan(childSpan, { [ATTR_NEXT_SPAN_TYPE]: 'Middleware.execute' });

        expect(getCapturedScopesOnSpan(childSpan).isolationScope).toBe(isolationScopeBefore);
      });
    });
  });
});
