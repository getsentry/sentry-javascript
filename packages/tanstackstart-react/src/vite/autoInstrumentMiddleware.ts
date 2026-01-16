import type { Plugin } from 'vite';

type AutoInstrumentMiddlewareOptions = {
  enabled?: boolean;
  debug?: boolean;
};

/**
 * A Vite plugin that automatically instruments TanStack Start middlewares.
 *
 * Phase 1: Only wraps global middlewares in `createStart()` configuration
 * (`requestMiddleware` and `functionMiddleware` arrays).
 *
 * @param options - Configuration options for the plugin
 * @returns A Vite plugin
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
      if (!code.includes('createStart')) {
        return null;
      }

      // Skip if the user already did some manual wrapping
      if (code.includes('wrapMiddlewaresWithSentry')) {
        return null;
      }

      let transformed = code;
      let needsImport = false;

      transformed = transformed.replace(
        /(requestMiddleware|functionMiddleware)\s*:\s*\[([^\]]*)\]/g,
        (match, key, contents) => {
          const objContents = arrayToObjectShorthand(contents);
          if (objContents) {
            needsImport = true;
            if (debug) {
              // eslint-disable-next-line no-console
              console.log(`[Sentry] Auto-wrapping ${key} in ${id}`);
            }
            return `${key}: wrapMiddlewaresWithSentry(${objContents})`;
          }
          return match;
        },
      );

      if (needsImport) {
        transformed = `import { wrapMiddlewaresWithSentry } from '@sentry/tanstackstart-react';\n${transformed}`;
        console.log(`[Sentry] transformed:`, transformed);
        return { code: transformed, map: null };
      }

      return null;
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

  return `{ ${items.join(', ')} }`;
}
