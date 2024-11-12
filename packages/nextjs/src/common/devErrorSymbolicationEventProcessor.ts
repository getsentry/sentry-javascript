import { suppressTracing } from '@sentry/core';
import type { Event, EventHint } from '@sentry/types';
import { GLOBAL_OBJ } from '@sentry/utils';
import type { StackFrame } from 'stacktrace-parser';
import * as stackTraceParser from 'stacktrace-parser';

type OriginalStackFrameResponse = {
  originalStackFrame: StackFrame;
  originalCodeFrame: string | null;
  sourcePackage?: string;
};

const globalWithInjectedValues = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  _sentryBasePath?: string;
};

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

    let basePath = process.env._sentryBasePath ?? globalWithInjectedValues._sentryBasePath ?? '';

    // Prefix the basepath with a slash if it doesn't have one
    if (basePath !== '' && !basePath.match(/^\//)) {
      basePath = `/${basePath}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await suppressTracing(() =>
      fetch(
        `${
          // eslint-disable-next-line no-restricted-globals
          typeof window === 'undefined' ? 'http://localhost:3000' : '' // TODO: handle the case where users define a different port
        }${basePath}/__nextjs_original-stack-frame?${params.toString()}`,
        {
          signal: controller.signal,
        },
      ).finally(() => {
        clearTimeout(timer);
      }),
    );

    if (!res.ok || res.status === 204) {
      return null;
    }

    const body: OriginalStackFrameResponse = await res.json();

    return {
      originalCodeFrame: body.originalCodeFrame,
      originalStackFrame: body.originalStackFrame,
    };
  } catch (e) {
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
 * Event processor that will symbolicate errors by using the webpack/nextjs dev server that is used to show stack traces
 * in the dev overlay.
 */
export async function devErrorSymbolicationEventProcessor(event: Event, hint: EventHint): Promise<Event | null> {
  // Filter out spans for requests resolving source maps for stack frames in dev mode
  if (event.type === 'transaction') {
    event.spans = event.spans?.filter(span => {
      const httpUrlAttribute: unknown = span.data?.['http.url'];
      if (typeof httpUrlAttribute === 'string') {
        return !httpUrlAttribute.includes('__nextjs_original-stack-frame');
      }

      return true;
    });
  }

  // Due to changes across Next.js versions, there are a million things that can go wrong here so we just try-catch the  // entire event processor.Symbolicated stack traces are just a nice to have.
  try {
    if (hint.originalException && hint.originalException instanceof Error && hint.originalException.stack) {
      const frames = stackTraceParser.parse(hint.originalException.stack);

      const resolvedFrames = await Promise.all(
        frames.map(frame => resolveStackFrame(frame, hint.originalException as Error)),
      );

      if (event.exception?.values?.[0]?.stacktrace?.frames) {
        event.exception.values[0].stacktrace.frames = event.exception.values[0].stacktrace.frames.map(
          (frame, i, frames) => {
            const resolvedFrame = resolvedFrames[frames.length - 1 - i];
            if (!resolvedFrame || !resolvedFrame.originalStackFrame || !resolvedFrame.originalCodeFrame) {
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
              filename: resolvedFrame.originalStackFrame.file || undefined,
              lineno: resolvedFrame.originalStackFrame.lineNumber || undefined,
              colno: resolvedFrame.originalStackFrame.column || undefined,
            };
          },
        );
      }
    }
  } catch (e) {
    return event;
  }

  return event;
}
