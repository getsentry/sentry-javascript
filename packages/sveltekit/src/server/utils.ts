import type { DynamicSamplingContext, StackFrame, TraceparentData } from '@sentry/types';
import { baggageHeaderToDynamicSamplingContext, basename, extractTraceparentData } from '@sentry/utils';
import type { RequestEvent } from '@sveltejs/kit';

/**
 * Takes a request event and extracts traceparent and DSC data
 * from the `sentry-trace` and `baggage` DSC headers.
 */
export function getTracePropagationData(event: RequestEvent): {
  traceparentData?: TraceparentData;
  dynamicSamplingContext?: Partial<DynamicSamplingContext>;
} {
  const sentryTraceHeader = event.request.headers.get('sentry-trace');
  const baggageHeader = event.request.headers.get('baggage');
  const traceparentData = sentryTraceHeader ? extractTraceparentData(sentryTraceHeader) : undefined;
  const dynamicSamplingContext = baggageHeaderToDynamicSamplingContext(baggageHeader);

  return { traceparentData, dynamicSamplingContext };
}

/**
 * A custom iteratee function for the `RewriteFrames` integration.
 *
 * Does the same as the default iteratee, but also removes the `module` property from the
 * frame to improve issue grouping.
 *
 * For some reason, our stack trace processing pipeline isn't able to resolve the bundled
 * module name to the original file name correctly, leading to individual error groups for
 * each module. Removing the `module` field makes the grouping algorithm fall back to the
 * `filename` field, which is correctly resolved and hence grouping works as expected.
 */
export function rewriteFramesIteratee(frame: StackFrame): StackFrame {
  if (!frame.filename) {
    return frame;
  }

  const prefix = 'app:///';

  // Check if the frame filename begins with `/` or a Windows-style prefix such as `C:\`
  const isWindowsFrame = /^[a-zA-Z]:\\/.test(frame.filename);
  const startsWithSlash = /^\//.test(frame.filename);
  if (isWindowsFrame || startsWithSlash) {
    const filename = isWindowsFrame
      ? frame.filename
          .replace(/^[a-zA-Z]:/, '') // remove Windows-style prefix
          .replace(/\\/g, '/') // replace all `\\` instances with `/`
      : frame.filename;

    const base = basename(filename);
    frame.filename = `${prefix}${base}`;
  }

  delete frame.module;

  return frame;
}
