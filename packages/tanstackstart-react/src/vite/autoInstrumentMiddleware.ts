import type { Plugin } from 'vite';

type AutoInstrumentMiddlewareOptions = {
  enabled?: boolean;
  debug?: boolean;
};

type WrapResult = {
  code: string;
  didWrap: boolean;
  skipped: string[];
};

/**
 * Wraps global middleware arrays (requestMiddleware, functionMiddleware) in createStart() files.
 */
export function wrapGlobalMiddleware(code: string, id: string, debug: boolean): WrapResult {
  const skipped: string[] = [];
  let didWrap = false;

  const transformed = code.replace(
    /(requestMiddleware|functionMiddleware)\s*:\s*\[([^\]]*)\]/g,
    (match: string, key: string, contents: string) => {
      const objContents = arrayToObjectShorthand(contents);
      if (objContents) {
        didWrap = true;
        if (debug) {
          // eslint-disable-next-line no-console
          console.log(`[Sentry] Auto-wrapping ${key} in ${id}`);
        }
        return `${key}: wrapMiddlewaresWithSentry(${objContents})`;
      }
      // Track middlewares that couldn't be auto-wrapped
      // Skip if we matched whitespace only
      if (contents.trim()) {
        skipped.push(key);
      }
      return match;
    },
  );

  return { code: transformed, didWrap, skipped };
}

/**
 * Wraps route middleware arrays in createFileRoute() files.
 */
export function wrapRouteMiddleware(code: string, id: string, debug: boolean): WrapResult {
  const skipped: string[] = [];
  let didWrap = false;

  const transformed = code.replace(
    /(\s+)(middleware)\s*:\s*\[([^\]]*)\]/g,
    (match: string, whitespace: string, key: string, contents: string) => {
      const objContents = arrayToObjectShorthand(contents);
      if (objContents) {
        didWrap = true;
        if (debug) {
          // eslint-disable-next-line no-console
          console.log(`[Sentry] Auto-wrapping route ${key} in ${id}`);
        }
        return `${whitespace}${key}: wrapMiddlewaresWithSentry(${objContents})`;
      }
      // Track middlewares that couldn't be auto-wrapped
      // Skip if we matched whitespace only
      if (contents.trim()) {
        skipped.push(`route ${key}`);
      }
      return match;
    },
  );

  return { code: transformed, didWrap, skipped };
}

/**
 * A Vite plugin that automatically instruments TanStack Start middlewares:
 * - `requestMiddleware` and `functionMiddleware` arrays in `createStart()`
 * - `middleware` arrays in `createFileRoute()` route definitions
 */
export function makeAutoInstrumentMiddlewarePlugin(options: AutoInstrumentMiddlewareOptions = {}): Plugin {
  const { enabled = true, debug = false } = options;

  return {
    name: 'sentry-tanstack-middleware-auto-instrument',
    enforce: 'pre',

    transform(code, id) {
      if (!enabled) {
        return null;
      }

      // Skip if not a TS/JS file
      if (!/\.(ts|tsx|js|jsx|mjs|mts)$/.test(id)) {
        return null;
      }

      // Detect file types that should be instrumented
      const isStartFile = id.includes('start') && code.includes('createStart(');
      const isRouteFile = code.includes('createFileRoute(') && /middleware\s*:\s*\[/.test(code);

      if (!isStartFile && !isRouteFile) {
        return null;
      }

      // Skip if the user already did some manual wrapping
      if (code.includes('wrapMiddlewaresWithSentry')) {
        return null;
      }

      let transformed = code;
      let needsImport = false;
      const skippedMiddlewares: string[] = [];

      if (isStartFile) {
        const result = wrapGlobalMiddleware(transformed, id, debug);
        transformed = result.code;
        needsImport = needsImport || result.didWrap;
        skippedMiddlewares.push(...result.skipped);
      }

      if (isRouteFile) {
        const result = wrapRouteMiddleware(transformed, id, debug);
        transformed = result.code;
        needsImport = needsImport || result.didWrap;
        skippedMiddlewares.push(...result.skipped);
      }

      // Warn about middlewares that couldn't be auto-wrapped
      if (skippedMiddlewares.length > 0) {
        // eslint-disable-next-line no-console
        console.warn(
          `[Sentry] Could not auto-instrument ${skippedMiddlewares.join(' and ')} in ${id}. ` +
            'To instrument these middlewares, use wrapMiddlewaresWithSentry() manually. ',
        );
      }

      // We didn't wrap any middlewares, so we don't need to import the wrapMiddlewaresWithSentry function
      if (!needsImport) {
        return null;
      }

      transformed = addSentryImport(transformed);

      return { code: transformed, map: null };
    },
  };
}

/**
 * Convert array contents to object shorthand syntax.
 * e.g., "foo, bar, baz" → "{ foo, bar, baz }"
 *
 * Returns null if contents contain non-identifier expressions (function calls, etc.)
 * which cannot be converted to object shorthand.
 */
export function arrayToObjectShorthand(contents: string): string | null {
  const items = contents
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  // Only convert if all items are valid identifiers (no complex expressions)
  const allIdentifiers = items.every(item => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(item));
  if (!allIdentifiers || items.length === 0) {
    return null;
  }

  // Deduplicate to avoid invalid syntax like { foo, foo }
  const uniqueItems = [...new Set(items)];

  return `{ ${uniqueItems.join(', ')} }`;
}

/**
 * Adds the wrapMiddlewaresWithSentry import to the code.
 * Handles 'use client' and 'use server' directives by inserting the import after them.
 */
export function addSentryImport(code: string): string {
  const sentryImport = "import { wrapMiddlewaresWithSentry } from '@sentry/tanstackstart-react';\n";

  // Check for 'use server' or 'use client' directives, these need to be before any imports
  const directiveMatch = code.match(/^(['"])use (client|server)\1;?\s*\n?/);

  if (!directiveMatch) {
    return sentryImport + code;
  }

  const directive = directiveMatch[0];
  return directive + sentryImport + code.slice(directive.length);
}
