import type { Event, Integration, StackFrame } from '@sentry/types';
import { addContextToFrame, GLOBAL_OBJ, stripUrlQueryAndFragment } from '@sentry/utils';

const WINDOW = GLOBAL_OBJ as typeof GLOBAL_OBJ & Window;

const DEFAULT_LINES_OF_CONTEXT = 7;

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
  public name: string;

  public constructor(private readonly _options: ContextLinesOptions = {}) {
    this.name = ContextLines.id;
  }

  /**
   * @inheritDoc
   */
  public setupOnce(_addGlobaleventProcessor: unknown, _getCurrentHub: unknown): void {
    // noop
  }

  /** @inheritDoc */
  public processEvent(event: Event): Event {
    return this.addSourceContext(event);
  }

  /**
   * Processes an event and adds context lines.
   *
   * TODO (v8): Make this internal/private
   */
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
          applySourceContextToFrame(
            frame,
            htmlLines,
            htmlFilename,
            this._options.frameContextLines != null ? this._options.frameContextLines : DEFAULT_LINES_OF_CONTEXT,
          ),
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
  linesOfContext: number,
): StackFrame {
  if (frame.filename !== htmlFilename || !frame.lineno || !htmlLines.length) {
    return frame;
  }

  addContextToFrame(htmlLines, frame, linesOfContext);

  return frame;
}
