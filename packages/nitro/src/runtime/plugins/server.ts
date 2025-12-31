import { captureException, GLOBAL_OBJ, SPAN_STATUS_ERROR, startSpanManual } from '@sentry/core';
import type { TracingRequestEvent as H3TracingRequestEvent } from 'h3/tracing';
import { definePlugin } from 'nitro';
import { tracingChannel } from 'otel-tracing-channel';

const globalWithTraceChannels = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  __SENTRY_NITRO_H3_CHANNEL__: ReturnType<typeof tracingChannel<H3TracingRequestEvent>>;
  __SENTRY_NITRO_SRVX_CHANNEL__: ReturnType<typeof tracingChannel>;
};

export default definePlugin(() => {
  setupH3TracingChannel();
  // setupSrvxTracingChannel();
});

function setupH3TracingChannel(): void {
  // Already registered, don't register again
  if (globalWithTraceChannels.__SENTRY_NITRO_H3_CHANNEL__) {
    return;
  }

  const h3Channel = tracingChannel<H3TracingRequestEvent>('h3.request.handler', data => {
    return startSpanManual(
      {
        name: `${data.event.req.method} ${data.event.url.pathname}`,
        op: 'h3.request.handler',
      },
      s => s,
    );
  });

  const NOOP = (): void => {};

  h3Channel.subscribe({
    start: NOOP,
    asyncStart: NOOP,
    end: NOOP,
    asyncEnd: data => {
      data.span?.end();
    },
    error: data => {
      captureException(data.error);
      data.span?.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
      data.span?.end();
    },
  });

  globalWithTraceChannels.__SENTRY_NITRO_H3_CHANNEL__ = h3Channel;
}
