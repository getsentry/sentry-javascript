import { StackFrame } from '@sentry/types';

export type StackLineParser = (line: string) => StackFrame | undefined;

/** Creates a stack parser with the supplied line parsers */
export function createStackParser(...parsers: StackLineParser[]) {
  return (stack: string): StackFrame[] => {
    const frames: StackFrame[] = [];

    for (const line of stack.split('\n')) {
      for (const parser of parsers) {
        const frame = parser(line);

        if (frame) {
          frames.push(frame);
          break;
        }
      }
    }

    return frames;
  };
}

const defaultFunctionName = '<anonymous>';

/**
 * Safely extract function name from itself
 */
export function getFunctionName(fn: unknown): string {
  try {
    if (!fn || typeof fn !== 'function') {
      return defaultFunctionName;
    }
    return fn.name || defaultFunctionName;
  } catch (e) {
    // Just accessing custom props in some Selenium environments
    // can cause a "Permission denied" exception (see raven-js#495).
    return defaultFunctionName;
  }
}
