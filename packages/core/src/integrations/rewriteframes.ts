import type { Event, StackFrame, Stacktrace } from '@sentry/types';
import { GLOBAL_OBJ, basename, relative } from '@sentry/utils';
import { defineIntegration } from '../integration';

type StackFrameIteratee = (frame: StackFrame) => StackFrame;

const INTEGRATION_NAME = 'RewriteFrames';

interface RewriteFramesOptions {
  /**
   * Root path (the beginning of the path) that will be stripped from the frames' filename.
   *
   * This option has slightly different behaviour in the browser and on servers:
   * - In the browser, the value you provide in `root` will be stripped from the beginning stack frames' paths (if the path started with the value).
   * - On the server, the root value will only replace the beginning of stack frame filepaths, when the path is absolute. If no `root` value is provided and the path is absolute, the frame will be reduced to only the filename and the provided `prefix` option.
   *
   * Browser example:
   * - Original frame: `'http://example.com/my/path/static/asset.js'`
   * - `root: 'http://example.com/my/path'`
   * - `assetPrefix: 'app://'`
   * - Resulting frame: `'app:///static/asset.js'`
   *
   * Server example:
   * - Original frame: `'/User/local/my/path/static/asset.js'`
   * - `root: '/User/local/my/path'`
   * - `assetPrefix: 'app://'`
   * - Resulting frame: `'app:///static/asset.js'`
   */
  root?: string;

  /**
   * A custom prefix that stack frames will be prepended with.
   *
   * Default: `'app://'`
   *
   * This option has slightly different behaviour in the browser and on servers:
   * - In the browser, the value you provide in `prefix` will prefix the resulting filename when the value you provided in `root` was applied. Effectively replacing whatever `root` matched in the beginning of the frame with `prefix`.
   * - On the server, the prefix is applied to all stackframes with absolute paths. On Windows, the drive identifier (e.g. "C://") is replaced with the prefix.
   */
  prefix?: string;

  /**
   * Defines an iterator that is used to iterate through all of the stack frames for modification before being sent to Sentry.
   * Setting this option will effectively disable both the `root` and the `prefix` options.
   */
  iteratee?: StackFrameIteratee;
}

/**
 * Rewrite event frames paths.
 */
export const rewriteFramesIntegration = defineIntegration((options: RewriteFramesOptions = {}) => {
  const root = options.root;
  const prefix = options.prefix || 'app:///';

  const isBrowser = 'window' in GLOBAL_OBJ && GLOBAL_OBJ.window !== undefined;

  const iteratee: StackFrameIteratee = options.iteratee || generateIteratee({ isBrowser, root, prefix });

  /** Process an exception event. */
  function _processExceptionsEvent(event: Event): Event {
    try {
      return {
        ...event,
        exception: {
          ...event.exception,
          // The check for this is performed inside `process` call itself, safe to skip here
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          values: event.exception!.values!.map(value => ({
            ...value,
            ...(value.stacktrace && { stacktrace: _processStacktrace(value.stacktrace) }),
          })),
        },
      };
    } catch (_oO) {
      return event;
    }
  }

  /** Process a stack trace. */
  function _processStacktrace(stacktrace?: Stacktrace): Stacktrace {
    return {
      ...stacktrace,
      frames: stacktrace && stacktrace.frames && stacktrace.frames.map(f => iteratee(f)),
    };
  }

  return {
    name: INTEGRATION_NAME,
    processEvent(originalEvent) {
      let processedEvent = originalEvent;

      if (originalEvent.exception && Array.isArray(originalEvent.exception.values)) {
        processedEvent = _processExceptionsEvent(processedEvent);
      }

      return processedEvent;
    },
  };
});

/**
 * Exported only for tests.
 */
export function generateIteratee({
  isBrowser,
  root,
  prefix,
}: {
  isBrowser: boolean;
  root?: string;
  prefix: string;
}): StackFrameIteratee {
  return (frame: StackFrame) => {
    if (!frame.filename) {
      return frame;
    }

    // Determine if this is a Windows frame by checking for a Windows-style prefix such as `C:\`
    const isWindowsFrame =
      /^[a-zA-Z]:\\/.test(frame.filename) ||
      // or the presence of a backslash without a forward slash (which are not allowed on Windows)
      (frame.filename.includes('\\') && !frame.filename.includes('/'));

    // Check if the frame filename begins with `/`
    const startsWithSlash = /^\//.test(frame.filename);

    if (isBrowser) {
      if (root) {
        const oldFilename = frame.filename;
        if (oldFilename.indexOf(root) === 0) {
          frame.filename = oldFilename.replace(root, prefix);
        }
      }
    } else {
      if (isWindowsFrame || startsWithSlash) {
        const filename = isWindowsFrame
          ? frame.filename
              .replace(/^[a-zA-Z]:/, '') // remove Windows-style prefix
              .replace(/\\/g, '/') // replace all `\\` instances with `/`
          : frame.filename;
        const base = root ? relative(root, filename) : basename(filename);
        frame.filename = `${prefix}${base}`;
      }
    }

    return frame;
  };
}
