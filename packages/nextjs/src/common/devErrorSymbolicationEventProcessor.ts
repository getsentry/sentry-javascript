import type { Event, EventHint } from '@sentry/core';
import { debug, GLOBAL_OBJ, parseSemver, suppressTracing } from '@sentry/core';
import type { StackFrame } from 'stacktrace-parser';
import * as stackTraceParser from 'stacktrace-parser';
import { DEBUG_BUILD } from './debug-build';

type OriginalStackFrameResponse = {
  originalStackFrame: StackFrame;
  originalCodeFrame: string | null;
  sourcePackage?: string;
};

const globalWithInjectedValues = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  _sentryBasePath?: string;
  _sentryNextJsVersion: string | undefined;
};

/**
 * Constructs the base URL for the Next.js dev server, including the port and base path.
 * Returns only the base path when running in the browser (client-side) for relative URLs.
 */
function getDevServerBaseUrl(): string {
  let basePath = process.env._sentryBasePath ?? globalWithInjectedValues._sentryBasePath ?? '';

  // Prefix the basepath with a slash if it doesn't have one
  if (basePath !== '' && !basePath.match(/^\//)) {
    basePath = `/${basePath}`;
  }

  // eslint-disable-next-line no-restricted-globals
  if (typeof window !== 'undefined') {
    return basePath;
  }

  const devServerPort = process.env.PORT || '3000';
  return `http://localhost:${devServerPort}${basePath}`;
}

/**
 * Fetches a URL with a 3-second timeout using AbortController.
 */
async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);

  return suppressTracing(() =>
    fetch(url, {
      ...options,
      signal: controller.signal,
    }).finally(() => {
      clearTimeout(timer);
    }),
  );
}

/**
 * Event processor that will symbolicate errors by using the webpack/nextjs dev server that is used to show stack traces
 * in the dev overlay.
 */
export async function devErrorSymbolicationEventProcessor(event: Event, hint: EventHint): Promise<Event | null> {
  // Filter out spans for requests resolving source maps for stack frames in dev mode
  if (event.type === 'transaction') {
    event.spans = event.spans?.filter(span => {
      const httpUrlAttribute: unknown = span.data?.['http.url'];
      if (typeof httpUrlAttribute === 'string') {
        return !httpUrlAttribute.includes('__nextjs_original-stack-frame'); // could also be __nextjs_original-stack-frames (plural)
      }

      return true;
    });
  }

  // Due to changes across Next.js versions, there are a million things that can go wrong here so we just try-catch the
  // entire event processor. Symbolicated stack traces are just a nice to have.
  try {
    if (hint.originalException && hint.originalException instanceof Error && hint.originalException.stack) {
      const frames = stackTraceParser.parse(hint.originalException.stack);
      const nextJsVersion = globalWithInjectedValues._sentryNextJsVersion;

      // If we for whatever reason don't have a Next.js version,
      // we don't want to symbolicate as this previously lead to infinite loops
      if (!nextJsVersion) {
        return event;
      }

      const parsedNextjsVersion = parseSemver(nextJsVersion);

      let resolvedFrames: ({
        originalCodeFrame: string | null;
        originalStackFrame: (StackFrame & { line1?: number; column1?: number }) | null;
      } | null)[];

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      if (parsedNextjsVersion.major! > 15 || (parsedNextjsVersion.major === 15 && parsedNextjsVersion.minor! >= 2)) {
        const r = await resolveStackFrames(frames);
        if (r === null) {
          return event;
        }
        resolvedFrames = r;
      } else {
        resolvedFrames = await Promise.all(
          frames.map(frame => resolveStackFrame(frame, hint.originalException as Error)),
        );
      }

      if (event.exception?.values?.[0]?.stacktrace?.frames) {
        event.exception.values[0].stacktrace.frames = event.exception.values[0].stacktrace.frames.map(
          (frame, i, frames) => {
            const resolvedFrame = resolvedFrames[frames.length - 1 - i];
            if (!resolvedFrame?.originalStackFrame || !resolvedFrame.originalCodeFrame) {
              return {
                ...frame,
                platform: frame.filename?.startsWith('node:internal') ? 'nodejs' : undefined, // simple hack that will prevent a source mapping error from showing up
                in_app: false,
              };
            }

            const { contextLine, preContextLines, postContextLines } = parseOriginalCodeFrame(
              resolvedFrame.originalCodeFrame,
            );

            return {
              ...frame,
              pre_context: preContextLines,
              context_line: contextLine,
              post_context: postContextLines,
              function: resolvedFrame.originalStackFrame.methodName,
              filename: resolvedFrame.originalStackFrame.file
                ? stripWebpackInternalPrefix(resolvedFrame.originalStackFrame.file)
                : undefined,
              lineno:
                resolvedFrame.originalStackFrame.lineNumber || resolvedFrame.originalStackFrame.line1 || undefined,
              colno: resolvedFrame.originalStackFrame.column || resolvedFrame.originalStackFrame.column1 || undefined,
            };
          },
        );
      }
    }
  } catch {
    return event;
  }

  return event;
}

async function resolveStackFrame(
  frame: StackFrame,
  error: Error,
): Promise<{ originalCodeFrame: string | null; originalStackFrame: StackFrame | null } | null> {
  try {
    if (!(frame.file?.startsWith('webpack-internal:') || frame.file?.startsWith('file:'))) {
      return null;
    }

    const params = new URLSearchParams();
    params.append('isServer', String(false)); // doesn't matter since it is overwritten by isAppDirectory
    params.append('isEdgeServer', String(false)); // doesn't matter since it is overwritten by isAppDirectory
    params.append('isAppDirectory', String(true)); // will force server to do more thorough checking
    params.append('errorMessage', error.toString());
    Object.keys(frame).forEach(key => {
      params.append(key, (frame[key as keyof typeof frame] ?? '').toString());
    });

    const baseUrl = getDevServerBaseUrl();
    const res = await fetchWithTimeout(`${baseUrl}/__nextjs_original-stack-frame?${params.toString()}`);

    if (!res.ok || res.status === 204) {
      return null;
    }

    const body: OriginalStackFrameResponse = await res.json();

    return {
      originalCodeFrame: body.originalCodeFrame,
      originalStackFrame: body.originalStackFrame,
    };
  } catch (e) {
    DEBUG_BUILD && debug.error('Failed to symbolicate event with Next.js dev server', e);
    return null;
  }
}

async function resolveStackFrames(
  frames: StackFrame[],
): Promise<{ originalCodeFrame: string | null; originalStackFrame: StackFrame | null }[] | null> {
  try {
    const postBody = {
      frames: frames
        .filter(frame => {
          return !!frame.file;
        })
        .map(frame => {
          // https://github.com/vercel/next.js/blob/df0573a478baa8b55478a7963c473dddd59a5e40/packages/next/src/client/components/react-dev-overlay/server/middleware-turbopack.ts#L129
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          frame.file = frame.file!.replace(/^rsc:\/\/React\/[^/]+\//, '').replace(/\?\d+$/, '');

          return {
            file: frame.file,
            methodName: frame.methodName ?? '<unknown>',
            arguments: [],
            lineNumber: frame.lineNumber ?? 0,
            column: frame.column ?? 0,
            line1: frame.lineNumber ?? 0,
            column1: frame.column ?? 0,
          };
        }),
      isServer: false,
      isEdgeServer: false,
      isAppDirectory: true,
    };

    const baseUrl = getDevServerBaseUrl();
    const res = await fetchWithTimeout(`${baseUrl}/__nextjs_original-stack-frames`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(postBody),
    });

    if (!res.ok || res.status === 204) {
      return null;
    }

    const body: { value: OriginalStackFrameResponse }[] = await res.json();

    return body.map(frame => {
      return {
        originalCodeFrame: frame.value.originalCodeFrame,
        originalStackFrame: frame.value.originalStackFrame,
      };
    });
  } catch (e) {
    DEBUG_BUILD && debug.error('Failed to symbolicate event with Next.js dev server', e);
    return null;
  }
}

function parseOriginalCodeFrame(codeFrame: string): {
  contextLine: string | undefined;
  preContextLines: string[];
  postContextLines: string[];
} {
  const preProcessedLines = codeFrame
    // Remove ASCII control characters that are used for syntax highlighting
    .replace(
      // eslint-disable-next-line no-control-regex
      /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, // https://stackoverflow.com/a/29497680
      '',
    )
    .split('\n')
    // Remove line that is supposed to indicate where the error happened
    .filter(line => !line.match(/^\s*\|/))
    // Find the error line
    .map(line => ({
      line,
      isErrorLine: !!line.match(/^>/),
    }))
    // Remove the leading part that is just for prettier output
    .map(lineObj => ({
      ...lineObj,
      line: lineObj.line.replace(/^.*\|/, ''),
    }));

  const preContextLines = [];
  let contextLine: string | undefined = undefined;
  const postContextLines = [];

  let reachedContextLine = false;

  for (const preProcessedLine of preProcessedLines) {
    if (preProcessedLine.isErrorLine) {
      contextLine = preProcessedLine.line;
      reachedContextLine = true;
    } else if (reachedContextLine) {
      postContextLines.push(preProcessedLine.line);
    } else {
      preContextLines.push(preProcessedLine.line);
    }
  }

  return {
    contextLine,
    preContextLines,
    postContextLines,
  };
}

/**
 * Strips webpack-internal prefixes from filenames to clean up stack traces.
 *
 * Examples:
 * - "webpack-internal:///./components/file.tsx" -> "./components/file.tsx"
 * - "webpack-internal:///(app-pages-browser)/./components/file.tsx" -> "./components/file.tsx"
 */
function stripWebpackInternalPrefix(filename: string): string | undefined {
  if (!filename) {
    return filename;
  }

  const webpackInternalRegex = /^webpack-internal:(?:\/+)?(?:\([^)]*\)\/)?(.+)$/;
  const match = filename.match(webpackInternalRegex);

  return match ? match[1] : filename;
}
