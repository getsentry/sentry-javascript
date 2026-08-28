import { spanStreamingIntegration as spanStreamingIntegrationCore } from '@sentry/core';

interface SpanStreamingOptions {
  /**
   * When enabled, a trace is flushed shortly after its segment span ends, rather than relying solely
   * on the buffer's timeout/size thresholds or an explicit `flushTraceSpans` emission.
   *
   * This is used in the browser, where we never know when the page is closed or navigated away from,
   * so spans must be sent timely.
   *
   * @default false
   */
  flushOnSegmentEnd?: boolean;
}

export const spanStreamingIntegration = (options?: SpanStreamingOptions) => {
  return spanStreamingIntegrationCore({
    flushOnSegmentEnd: true,
    ...options,
  });
};
