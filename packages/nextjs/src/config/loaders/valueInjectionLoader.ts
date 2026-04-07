import type { LoaderThis } from './types';

export type ValueInjectionLoaderOptions = {
  values: Record<string, unknown>;
};

// We need to be careful not to inject anything before any `"use strict";`s or "use client"s or really any other
// directives. A small scanner is easier to reason about than the previous regex and avoids regex backtracking concerns.
export function findInjectionIndexAfterDirectives(userCode: string): number {
  let index = 0;
  let lastDirectiveEndIndex: number | undefined;

  while (index < userCode.length) {
    const statementStartIndex = skipWhitespaceAndComments(userCode, index);

    const nextDirectiveIndex = skipDirective(userCode, statementStartIndex);
    if (nextDirectiveIndex === undefined) {
      return lastDirectiveEndIndex ?? statementStartIndex;
    }

    const statementEndIndex = skipDirectiveTerminator(userCode, nextDirectiveIndex);
    if (statementEndIndex === undefined) {
      return lastDirectiveEndIndex ?? statementStartIndex;
    }

    index = statementEndIndex;
    lastDirectiveEndIndex = statementEndIndex;
  }

  return lastDirectiveEndIndex ?? index;
}

function skipWhitespaceAndComments(userCode: string, startIndex: number): number {
  let index = startIndex;

  while (index < userCode.length) {
    const char = userCode[index];
    const nextChar = userCode[index + 1];

    if (char && /\s/.test(char)) {
      index += 1;
      continue;
    }

    if (char === '/' && nextChar === '/') {
      index += 2;
      while (index < userCode.length && userCode[index] !== '\n' && userCode[index] !== '\r') {
        index += 1;
      }
      continue;
    }

    if (char === '/' && nextChar === '*') {
      const commentEndIndex = userCode.indexOf('*/', index + 2);
      if (commentEndIndex === -1) {
        return startIndex;
      }

      index = commentEndIndex + 2;
      continue;
    }

    return index;
  }

  return index;
}

function skipDirective(userCode: string, startIndex: number): number | undefined {
  const quote = userCode[startIndex];

  if (quote !== '"' && quote !== "'") {
    return undefined;
  }

  let index = startIndex + 1;
  let foundClosingQuote = false;

  while (index < userCode.length) {
    const char = userCode[index];

    if (char === '\\') {
      index += 2;
      continue;
    }

    if (char === quote) {
      index += 1;
      foundClosingQuote = true;
      break;
    }

    if (char === '\n' || char === '\r') {
      return undefined;
    }

    index += 1;
  }

  if (!foundClosingQuote) {
    return undefined;
  }

  return index;
}

function skipDirectiveTerminator(userCode: string, startIndex: number): number | undefined {
  let index = startIndex;

  while (index < userCode.length) {
    const char = userCode[index];
    const nextChar = userCode[index + 1];

    if (char === ';') {
      return index + 1;
    }

    if (char === '\n' || char === '\r' || char === '}') {
      return index;
    }

    if (char && /\s/.test(char)) {
      index += 1;
      continue;
    }

    if (char === '/' && nextChar === '/') {
      return index;
    }

    if (char === '/' && nextChar === '*') {
      const commentEndIndex = userCode.indexOf('*/', index + 2);
      if (commentEndIndex === -1) {
        return undefined;
      }

      const comment = userCode.slice(index + 2, commentEndIndex);
      if (comment.includes('\n') || comment.includes('\r')) {
        return index;
      }

      index = commentEndIndex + 2;
      continue;
    }

    return undefined;
  }

  return index;
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
