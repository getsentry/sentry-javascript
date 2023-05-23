import type { DynamicSamplingContext, StackFrame, TraceparentData } from '@sentry/types';
import {
  baggageHeaderToDynamicSamplingContext,
  basename,
  escapeStringForRegex,
  extractTraceparentData,
} from '@sentry/utils';
import type { RequestEvent } from '@sveltejs/kit';

import { WRAPPED_MODULE_SUFFIX } from '../vite/autoInstrument';

/**
 * Extend the `global` type with custom properties that are
 * injected by the SvelteKit SDK at build time.
 * @see packages/sveltekit/src/vite/sourcemaps.ts
 */
export type GlobalWithSentryValues = typeof globalThis & {
  __sentry_sveltekit_output_dir?: string;
};

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
  const globalWithSentryValues: GlobalWithSentryValues = globalThis;
  const svelteKitBuildOutDir = globalWithSentryValues.__sentry_sveltekit_output_dir;
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

    let strippedFilename;
    if (svelteKitBuildOutDir) {
      strippedFilename = filename.replace(new RegExp(`^.*${escapeStringForRegex(svelteKitBuildOutDir)}\/server\/`), '');
    } else {
      strippedFilename = basename(filename);
    }
    frame.filename = `${prefix}${strippedFilename}`;
  }

  delete frame.module;

  // In dev-mode, the WRAPPED_MODULE_SUFFIX is still present in the frame's file name.
  // We need to remove it to make sure that the frame's filename matches the actual file
  if (frame.filename.endsWith(WRAPPED_MODULE_SUFFIX)) {
    frame.filename = frame.filename.slice(0, -WRAPPED_MODULE_SUFFIX.length);
  }

  return frame;
}
