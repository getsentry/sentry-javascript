import type { Plugin } from 'vite';

type AutoInstrumentMiddlewareOptions = {
  enabled?: boolean;
  debug?: boolean;
};

/**
 * A Vite plugin that automatically instruments TanStack Start middlewares
 * by wrapping `requestMiddleware` and `functionMiddleware` arrays in `createStart()`.
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

      // Only wrap requestMiddleware and functionMiddleware in createStart()
      if (!code.includes('createStart(')) {
        return null;
      }

      // Skip if the user already did some manual wrapping
      if (code.includes('wrapMiddlewaresWithSentry')) {
        return null;
      }

      let transformed = code;
      let needsImport = false;
      const skippedMiddlewares: string[] = [];

      transformed = transformed.replace(
        /(requestMiddleware|functionMiddleware)\s*:\s*\[([^\]]*)\]/g,
        (match: string, key: string, contents: string) => {
          const objContents = arrayToObjectShorthand(contents);
          if (objContents) {
            needsImport = true;
            if (debug) {
              // eslint-disable-next-line no-console
              console.log(`[Sentry] Auto-wrapping ${key} in ${id}`);
            }
            return `${key}: wrapMiddlewaresWithSentry(${objContents})`;
          }
          // Track middlewares that couldn't be auto-wrapped
          // Skip if we matched whitespace only
          if (contents.trim()) {
            skippedMiddlewares.push(key);
          }
          return match;
        },
      );

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

      const sentryImport = "import { wrapMiddlewaresWithSentry } from '@sentry/tanstackstart-react';\n";

      // Check for 'use server' or 'use client' directives, these need to be before any imports
      const directiveMatch = transformed.match(/^(['"])use (client|server)\1;?\s*\n?/);
      if (directiveMatch) {
        // Insert import after the directive
        const directive = directiveMatch[0];
        transformed = directive + sentryImport + transformed.slice(directive.length);
      } else {
        transformed = sentryImport + transformed;
      }

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
