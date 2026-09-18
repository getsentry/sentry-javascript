import { beforeEach, describe, expect, it } from 'vitest';
import { getCurrentScope } from '../../src/currentScopes';
import { withMonitor } from '../../src/monitor';
import { setCurrentClient } from '../../src/sdk';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';
import { resetGlobals } from '../testutils';

describe('withMonitor', () => {
  beforeEach(() => {
    resetGlobals();

    const client = new TestClient(getDefaultTestClientOptions({ dsn: 'https://username@domain/123' }));
    setCurrentClient(client);
    client.init();
  });

  it('keeps the parent trace when not isolating the trace', () => {
    const parentTraceId = getCurrentScope().getPropagationContext().traceId;

    withMonitor('cron-job', () => {
      expect(getCurrentScope().getPropagationContext().traceId).toBe(parentTraceId);
    });
  });

  it('starts a separate trace when isolateTrace is set', () => {
    const parentTraceId = getCurrentScope().getPropagationContext().traceId;

    withMonitor(
      'cron-job',
      () => {
        expect(getCurrentScope().getPropagationContext().traceId).not.toBe(parentTraceId);
      },
      { schedule: { type: 'crontab', value: '* * * * *' }, isolateTrace: true },
    );
  });

  // The parent's propagation context is restored onto the monitor scope, so it
  // must be copied rather than aliased. Several call sites mutate the
  // propagation context in place (e.g. the Node HTTP server integration
  // assigns `propagationSpanId`), which would otherwise rewrite the parent's
  // trace from inside the callback.
  it('does not let the callback mutate the parent propagation context', () => {
    const parentScope = getCurrentScope();
    const parentPropagationContext = parentScope.getPropagationContext();

    withMonitor('cron-job', () => {
      const propagationContext = getCurrentScope().getPropagationContext();

      expect(propagationContext).not.toBe(parentPropagationContext);
      expect(propagationContext).toEqual(parentPropagationContext);

      propagationContext.propagationSpanId = 'deadbeefdeadbeef';
      propagationContext.traceId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    });

    expect(parentScope.getPropagationContext()).toEqual(parentPropagationContext);
    expect(parentPropagationContext.propagationSpanId).toBeUndefined();
  });
});
