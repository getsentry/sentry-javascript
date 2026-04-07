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
    const scanStartIndex = index;

    // Comments can appear between directive prologue entries, so keep scanning until we reach the next statement.
    while (index < userCode.length) {
      const char = userCode[index];

      if (char && /\s/.test(char)) {
        index += 1;
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
          return lastDirectiveEndIndex ?? scanStartIndex;
        }

        index = commentEndIndex + 2;
        continue;
      }

      break;
    }

    const statementStartIndex = index;
    const quote = userCode[statementStartIndex];
    if (quote !== '"' && quote !== "'") {
      return lastDirectiveEndIndex ?? statementStartIndex;
    }

    const stringEndIndex = findStringLiteralEnd(userCode, statementStartIndex);
    if (stringEndIndex === undefined) {
      return lastDirectiveEndIndex ?? statementStartIndex;
    }

    let statementEndIndex = stringEndIndex;

    // Only a bare string literal followed by a statement terminator counts as a directive.
    while (statementEndIndex < userCode.length) {
      const char = userCode[statementEndIndex];

      if (char === ';') {
        statementEndIndex += 1;
        break;
      }

      if (char === '\n' || char === '\r' || char === '}') {
        break;
      }

      if (char && /\s/.test(char)) {
        statementEndIndex += 1;
        continue;
      }

      if (userCode.startsWith('//', statementEndIndex)) {
        break;
      }

      if (userCode.startsWith('/*', statementEndIndex)) {
        const commentEndIndex = userCode.indexOf('*/', statementEndIndex + 2);
        if (commentEndIndex === -1) {
          return lastDirectiveEndIndex ?? statementStartIndex;
        }

        const comment = userCode.slice(statementEndIndex + 2, commentEndIndex);
        if (comment.includes('\n') || comment.includes('\r')) {
          break;
        }

        statementEndIndex = commentEndIndex + 2;
        continue;
      }

      return lastDirectiveEndIndex ?? statementStartIndex;
    }

    index = statementEndIndex;
    lastDirectiveEndIndex = statementEndIndex;
  }

  return lastDirectiveEndIndex ?? index;
}

function findStringLiteralEnd(userCode: string, startIndex: number): number | undefined {
  const quote = userCode[startIndex];
  let index = startIndex + 1;

  while (index < userCode.length) {
    const char = userCode[index];

    if (char === '\\') {
      index += 2;
      continue;
    }

    if (char === quote) {
      return index + 1;
    }

    if (char === '\n' || char === '\r') {
      return undefined;
    }

    index += 1;
  }

  return undefined;
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
