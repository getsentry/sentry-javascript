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

type FileTransformState = {
  code: string;
  needsImport: boolean;
  skippedMiddlewares: string[];
};

/**
 * Core function that wraps middleware arrays matching the given regex.
 */
function wrapMiddlewareArrays(code: string, id: string, debug: boolean, regex: RegExp): WrapResult {
  const skipped: string[] = [];
  let didWrap = false;

  const transformed = code.replace(regex, (match: string, key: string, contents: string) => {
    const objContents = arrayToObjectShorthand(contents);
    if (objContents) {
      didWrap = true;
      if (debug) {
        // eslint-disable-next-line no-console
        console.log(`[Sentry] Auto-wrapping ${key} in ${id}`);
      }
      // Handle method call syntax like `.middleware([...])` vs object property syntax like `middleware: [...]`
      if (key.endsWith('(')) {
        return `${key}wrapMiddlewaresWithSentry(${objContents}))`;
      }
      return `${key}: wrapMiddlewaresWithSentry(${objContents})`;
    }
    // Track middlewares that couldn't be auto-wrapped
    // Skip if we matched whitespace only
    if (contents.trim()) {
      skipped.push(key);
    }
    return match;
  });

  return { code: transformed, didWrap, skipped };
}

/**
 * Wraps global middleware arrays (requestMiddleware, functionMiddleware) in createStart() files.
 */
export function wrapGlobalMiddleware(code: string, id: string, debug: boolean): WrapResult {
  return wrapMiddlewareArrays(code, id, debug, /(requestMiddleware|functionMiddleware)\s*:\s*\[([^\]]*)\]/g);
}

/**
 * Wraps route middleware arrays in createFileRoute() files.
 */
export function wrapRouteMiddleware(code: string, id: string, debug: boolean): WrapResult {
  return wrapMiddlewareArrays(code, id, debug, /(middleware)\s*:\s*\[([^\]]*)\]/g);
}

/**
 * Wraps middleware arrays in createServerFn().middleware([...]) calls.
 */
export function wrapServerFnMiddleware(code: string, id: string, debug: boolean): WrapResult {
  return wrapMiddlewareArrays(code, id, debug, /(\.middleware\s*\()\s*\[([^\]]*)\]\s*\)/g);
}

/**
 * Applies a wrap function to the current state and returns the updated state.
 */
function applyWrap(
  state: FileTransformState,
  wrapFn: (code: string, id: string, debug: boolean) => WrapResult,
  id: string,
  debug: boolean,
): FileTransformState {
  const result = wrapFn(state.code, id, debug);
  return {
    code: result.code,
    needsImport: state.needsImport || result.didWrap,
    skippedMiddlewares: [...state.skippedMiddlewares, ...result.skipped],
  };
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
      const isServerFnFile = code.includes('createServerFn') && /\.middleware\s*\(\s*\[/.test(code);

      if (!isStartFile && !isRouteFile && !isServerFnFile) {
        return null;
      }

      // Skip if the user already did some manual wrapping
      if (code.includes('wrapMiddlewaresWithSentry')) {
        return null;
      }

      let fileTransformState: FileTransformState = {
        code,
        needsImport: false,
        skippedMiddlewares: [],
      };

      // Wrap middlewares
      if (isStartFile) {
        fileTransformState = applyWrap(fileTransformState, wrapGlobalMiddleware, id, debug);
      }
      if (isRouteFile) {
        fileTransformState = applyWrap(fileTransformState, wrapRouteMiddleware, id, debug);
      }
      if (isServerFnFile) {
        fileTransformState = applyWrap(fileTransformState, wrapServerFnMiddleware, id, debug);
      }

      // Warn about middlewares that couldn't be auto-wrapped
      if (fileTransformState.skippedMiddlewares.length > 0) {
        // eslint-disable-next-line no-console
        console.warn(
          `[Sentry] Could not auto-instrument ${fileTransformState.skippedMiddlewares.join(' and ')} in ${id}. ` +
            'To instrument these middlewares, use wrapMiddlewaresWithSentry() manually. ',
        );
      }

      // We didn't wrap any middlewares, so we don't need to import the wrapMiddlewaresWithSentry function
      if (!fileTransformState.needsImport) {
        return null;
      }

      return { code: addSentryImport(fileTransformState.code), map: null };
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

  // Don't add the import if it already exists
  if (code.includes(sentryImport.trimEnd())) {
    return code;
  }

  // Check for 'use server' or 'use client' directives, these need to be before any imports
  const directiveMatch = code.match(/^(['"])use (client|server)\1;?\s*\n?/);

  if (!directiveMatch) {
    return sentryImport + code;
  }

  const directive = directiveMatch[0];
  return directive + sentryImport + code.slice(directive.length);
}
