import { defineIntegration } from '@sentry/core';
import type { Event, IntegrationFn, StackFrame } from '@sentry/types';
import { GLOBAL_OBJ, addContextToFrame, stripUrlQueryAndFragment } from '@sentry/utils';

const WINDOW = GLOBAL_OBJ as typeof GLOBAL_OBJ & Window;

const DEFAULT_LINES_OF_CONTEXT = 7;

const INTEGRATION_NAME = 'ContextLines';

interface ContextLinesOptions {
  /**
   * Sets the number of context lines for each frame when loading a file.
   * Defaults to 7.
   *
   * Set to 0 to disable loading and inclusion of source files.
   **/
  frameContextLines?: number;
}

const _contextLinesIntegration = ((options: ContextLinesOptions = {}) => {
  const contextLines = options.frameContextLines != null ? options.frameContextLines : DEFAULT_LINES_OF_CONTEXT;

  return {
    name: INTEGRATION_NAME,
    processEvent(event) {
      return addSourceContext(event, contextLines);
    },
  };
}) satisfies IntegrationFn;

/**
 * Collects source context lines around the lines of stackframes pointing to JS embedded in
 * the current page's HTML.
 *
 * This integration DOES NOT work for stack frames pointing to JS files that are loaded by the browser.
 * For frames pointing to files, context lines are added during ingestion and symbolication
 * by attempting to download the JS files to the Sentry backend.
 *
 * Use this integration if you have inline JS code in HTML pages that can't be accessed
 * by our backend (e.g. due to a login-protected page).
 */
export const contextLinesIntegration = defineIntegration(_contextLinesIntegration);

/**
 * Processes an event and adds context lines.
 */
function addSourceContext(event: Event, contextLines: number): Event {
  const doc = WINDOW.document;
  const htmlFilename = WINDOW.location && stripUrlQueryAndFragment(WINDOW.location.href);
  if (!doc || !htmlFilename) {
    return event;
  }

  const exceptions = event.exception && event.exception.values;
  if (!exceptions || !exceptions.length) {
    return event;
  }

  const html = doc.documentElement.innerHTML;
  if (!html) {
    return event;
  }

  const htmlLines = ['<!DOCTYPE html>', '<html>', ...html.split('\n'), '</html>'];

  exceptions.forEach(exception => {
    const stacktrace = exception.stacktrace;
    if (stacktrace && stacktrace.frames) {
      stacktrace.frames = stacktrace.frames.map(frame =>
        applySourceContextToFrame(frame, htmlLines, htmlFilename, contextLines),
      );
    }
  });

  return event;
}

/**
 * Only exported for testing
 */
export function applySourceContextToFrame(
  frame: StackFrame,
  htmlLines: string[],
  htmlFilename: string,
  linesOfContext: number,
): StackFrame {
  if (frame.filename !== htmlFilename || !frame.lineno || !htmlLines.length) {
    return frame;
  }

  addContextToFrame(htmlLines, frame, linesOfContext);

  return frame;
}
