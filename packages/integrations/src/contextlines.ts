import type { Event, EventProcessor, Hub, Integration, StackFrame } from '@sentry/types';
import { GLOBAL_OBJ, stripUrlQueryAndFragment } from '@sentry/utils';

const WINDOW = GLOBAL_OBJ as typeof GLOBAL_OBJ & Window;

interface ContextLinesOptions {
  /**
   * Sets the number of context lines for each frame when loading a file.
   * Defaults to 7.
   *
   * Set to 0 to disable loading and inclusion of source files.
   **/
  frameContextLines?: number;
}

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
export class ContextLines implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'ContextLines';

  /**
   * @inheritDoc
   */
  public name: string = ContextLines.id;

  public constructor(private readonly _options: ContextLinesOptions = {}) {}

  /**
   * @inheritDoc
   */
  public setupOnce(addGlobalEventProcessor: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    addGlobalEventProcessor(event => {
      const self = getCurrentHub().getIntegration(ContextLines);
      if (!self) {
        return event;
      }
      return this.addSourceContext(event);
    });
  }

  /** Processes an event and adds context lines */
  public addSourceContext(event: Event): Event {
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
          applySourceContextToFrame(frame, htmlLines, htmlFilename, this._options.frameContextLines || 7),
        );
      }
    });

    return event;
  }
}

/**
 * Only exported for testing
 */
export function applySourceContextToFrame(
  frame: StackFrame,
  htmlLines: string[],
  htmlFilename: string,
  contextRange: number,
): StackFrame {
  if (frame.filename !== htmlFilename || !frame.lineno || !htmlLines.length) {
    return frame;
  }

  const sourroundingRange = Math.floor(contextRange / 2);
  const contextLineIndex = frame.lineno - 1;
  const preStartIndex = Math.max(contextLineIndex - sourroundingRange, 0);
  const postEndIndex = Math.min(contextLineIndex + sourroundingRange, htmlLines.length - 1);

  const preLines = htmlLines.slice(preStartIndex, contextLineIndex);
  const contextLine = htmlLines[contextLineIndex];
  const postLines = htmlLines.slice(contextLineIndex + 1, postEndIndex + 1);

  if (preLines.length) {
    frame.pre_context = preLines;
  }

  if (contextLine) {
    frame.context_line = contextLine;
  }

  if (postLines.length) {
    frame.post_context = postLines;
  }

  return frame;
}
