import type { LoaderThis } from './types';

export type ValueInjectionLoaderOptions = {
  values: Record<string, unknown>;
};

/**
 * Finds the index in user code at which to inject statements.
 *
 * The injection must come AFTER all prologue directives ("use strict", "use client", etc.)
 * and any surrounding whitespace/comments, but before any actual statements.
 *
 * Handles multiple directives, comments between directives, directives without semicolons,
 * escape sequences in strings, and strings followed by operators (which are not directives).
 */
export function findInjectionIndexAfterDirectives(userCode: string): number {
  let index = 0;
  let afterLastDirective: number | undefined;

  while (index < userCode.length) {
    const char = userCode[index];

    if (char && /\s/.test(char)) {
      index++;
      continue;
    }

    if (userCode.startsWith('//', index)) {
      const newlineIndex = userCode.indexOf('\n', index + 2);
      index = newlineIndex === -1 ? userCode.length : newlineIndex + 1;
      continue;
    }

    if (userCode.startsWith('/*', index)) {
      const commentEndIndex = userCode.indexOf('*/', index + 2);
      if (commentEndIndex === -1) {
        return afterLastDirective ?? 0;
      }

      index = commentEndIndex + 2;
      continue;
    }

    if (char === '"' || char === "'") {
      const stringEnd = findStringLiteralEnd(userCode, index);
      if (stringEnd === null) {
        return afterLastDirective ?? index;
      }

      const terminatorEnd = findDirectiveTerminator(userCode, stringEnd);
      if (terminatorEnd === null) {
        return afterLastDirective ?? index;
      }

      afterLastDirective = terminatorEnd;
      index = terminatorEnd;
      continue;
    }

    return afterLastDirective ?? index;
  }

  return afterLastDirective ?? index;
}

/**
 * Scans a string literal starting at `start` (which must be a quote character),
 * correctly handling escape sequences and rejecting unterminated/multiline strings.
 * Returns the index after the closing quote, or null if the string is unterminated.
 */
function findStringLiteralEnd(userCode: string, startIndex: number): number | null {
  const quote = userCode[startIndex];
  let index = startIndex + 1;

  while (index < userCode.length) {
    const char = userCode[index];

    if (char === '\\') {
      // skip escaped character
      index += 2;
      continue;
    }

    if (char === quote) {
      return index + 1; // found closing quote
    }

    if (char === '\n' || char === '\r') {
      return null; // unterminated
    }

    index++;
  }

  return null; // unterminated
}

/**
 * Starting at `i`, skips horizontal whitespace and single-line block comments,
 * then checks for a valid directive terminator: `;`, newline, `//`, or EOF.
 * Returns the index after the terminator, or null if no valid terminator is found
 * (meaning the preceding string literal is not a directive).
 */
function findDirectiveTerminator(userCode: string, startIndex: number): number | null {
  let index = startIndex;

  while (index < userCode.length) {
    const char = userCode[index];

    if (char === ';') {
      return index + 1;
    }

    if (char === '\n' || char === '\r' || char === '}') {
      return index;
    }

    if (char && /\s/.test(char)) {
      index++;
      continue;
    }

    if (userCode.startsWith('//', index)) {
      return index;
    }

    if (userCode.startsWith('/*', index)) {
      const commentEndIndex = userCode.indexOf('*/', index + 2);
      if (commentEndIndex === -1) {
        return null;
      }

      const comment = userCode.slice(index + 2, commentEndIndex);
      if (comment.includes('\n') || comment.includes('\r')) {
        return index;
      }

      index = commentEndIndex + 2;
      continue;
    }

    return null; // operator or any other token → not a directive
  }

  return index; // EOF is a valid terminator
}

/**
 * Set values on the global/window object at the start of a module.
 *
 * Options:
 *   - `values`: An object where the keys correspond to the keys of the global values to set and the values
 *        correspond to the values of the values on the global object. Values must be JSON serializable.
 */
export default function valueInjectionLoader(this: LoaderThis<ValueInjectionLoaderOptions>, userCode: string): string {
  // We know one or the other will be defined, depending on the version of webpack being used
  const { values } = 'getOptions' in this ? this.getOptions() : this.query;

  // We do not want to cache injected values across builds
  this.cacheable(false);

  // Not putting any newlines in the generated code will decrease the likelihood of sourcemaps breaking
  const injectedCode =
    // eslint-disable-next-line prefer-template
    ';' +
    Object.entries(values)
      .map(([key, value]) => `globalThis["${key}"] = ${JSON.stringify(value)};`)
      .join('');

  const injectionIndex = findInjectionIndexAfterDirectives(userCode);
  return `${userCode.slice(0, injectionIndex)}${injectedCode}${userCode.slice(injectionIndex)}`;
}
