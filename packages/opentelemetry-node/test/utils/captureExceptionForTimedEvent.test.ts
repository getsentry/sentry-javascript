import type { Span as OtelSpan, TimedEvent } from '@opentelemetry/sdk-trace-base';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import type { Hub } from '@sentry/types';

import { maybeCaptureExceptionForTimedEvent } from '../../src/utils/captureExceptionForTimedEvent';

describe('maybeCaptureExceptionForTimedEvent', () => {
  it('ignores non-exception events', async () => {
    const event: TimedEvent = {
      time: [12345, 0],
      name: 'test event',
    };

    const captureException = jest.fn();
    const hub = {
      captureException,
    } as unknown as Hub;

    maybeCaptureExceptionForTimedEvent(hub, event);

    expect(captureException).not.toHaveBeenCalled();
  });

  it('ignores exception events without EXCEPTION_MESSAGE', async () => {
    const event: TimedEvent = {
      time: [12345, 0],
      name: 'exception',
    };

    const captureException = jest.fn();
    const hub = {
      captureException,
    } as unknown as Hub;

    maybeCaptureExceptionForTimedEvent(hub, event);

    expect(captureException).not.toHaveBeenCalled();
  });

  it('captures exception from event with EXCEPTION_MESSAGE', async () => {
    const event: TimedEvent = {
      time: [12345, 0],
      name: 'exception',
      attributes: {
        [SemanticAttributes.EXCEPTION_MESSAGE]: 'test-message',
      },
    };

    const captureException = jest.fn();
    const hub = {
      captureException,
    } as unknown as Hub;

    maybeCaptureExceptionForTimedEvent(hub, event);

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(expect.objectContaining({ message: 'test-message' }), {
      captureContext: undefined,
    });
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
      captureContext: undefined,
    });
  });

  it('captures stack and type, if available', async () => {
    const event: TimedEvent = {
      time: [12345, 0],
      name: 'exception',
      attributes: {
        [SemanticAttributes.EXCEPTION_MESSAGE]: 'test-message',
        [SemanticAttributes.EXCEPTION_STACKTRACE]: 'test-stack',
        [SemanticAttributes.EXCEPTION_TYPE]: 'test-type',
      },
    };

    const captureException = jest.fn();
    const hub = {
      captureException,
    } as unknown as Hub;

    maybeCaptureExceptionForTimedEvent(hub, event);

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'test-message', name: 'test-type', stack: 'test-stack' }),
      {
        captureContext: undefined,
      },
    );
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
      captureContext: undefined,
    });
  });

  it('captures span context, if available', async () => {
    const event: TimedEvent = {
      time: [12345, 0],
      name: 'exception',
      attributes: {
        [SemanticAttributes.EXCEPTION_MESSAGE]: 'test-message',
      },
    };

    const span = {
      parentSpanId: 'test-parent-span-id',
      attributes: {
        'test-attr1': 'test-value1',
      },
      resource: {
        attributes: {
          'test-attr2': 'test-value2',
        },
      },
      spanContext: () => {
        return { spanId: 'test-span-id', traceId: 'test-trace-id' };
      },
    } as unknown as OtelSpan;

    const captureException = jest.fn();
    const hub = {
      captureException,
    } as unknown as Hub;

    maybeCaptureExceptionForTimedEvent(hub, event, span);

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(expect.objectContaining({ message: 'test-message' }), {
      captureContext: {
        contexts: {
          otel: {
            attributes: {
              'test-attr1': 'test-value1',
            },
            resource: {
              'test-attr2': 'test-value2',
            },
          },
          trace: {
            trace_id: 'test-trace-id',
            span_id: 'test-span-id',
            parent_span_id: 'test-parent-span-id',
          },
        },
      },
    });
  });
});
