'use strict';

/**
 * @fileoverview Rule to keep browser-facing code on the `@sentry/core/browser` span-start APIs.
 *
 * `startSpan`, `startInactiveSpan`, `startSpanManual` and `startIdleSpan` exist in two variants
 * under the same name: the plain ones at `@sentry/core` / `@sentry/core/server`, and guarded ones at
 * `@sentry/core/browser` that install `spanStreamingIntegration` on the client before starting the
 * span. The browser SDK's `init()` deliberately does not reference that integration - that reference
 * alone would keep the whole span streaming graph in every bundle, including error-only ones.
 *
 * Because both variants share their names, importing the plain one in browser code compiles fine and
 * creates spans that are then never sent. This rule is the only thing that catches it.
 */

const SPAN_START_APIS = ['startSpan', 'startInactiveSpan', 'startSpanManual', 'startIdleSpan'];

const RESTRICTED_SOURCES = ['@sentry/core', '@sentry/core/server'];

/**
 * Which parts of which package are browser-facing.
 *
 * `true` means the package's whole `src` (plus `addon`, for ember) ships to the browser. An array
 * lists the paths that do, for packages that also contain server, edge or build-time code - those
 * must keep using the plain `@sentry/core` APIs.
 */
const BROWSER_FACING = {
  angular: true,
  browser: true,
  'browser-utils': true,
  ember: true,
  feedback: true,
  gatsby: true,
  react: true,
  'replay-canvas': true,
  'replay-internal': true,
  solid: true,
  svelte: true,
  vue: true,
  wasm: true,

  astro: ['src/client'],
  // `tracer.ts` backs both the client and the server entry, so it needs the guarded variant too.
  effect: ['src/client', 'src/tracer.ts'],
  nextjs: ['src/client'],
  nuxt: ['src/client'],
  'react-router': ['src/client'],
  remix: ['src/client'],
  solidstart: ['src/client'],
  sveltekit: ['src/client'],
  'tanstackstart-react': ['src/client'],
};

/** Resolve `<package>` and the package-relative path out of a file path. */
function splitPackagePath(filename) {
  const match = /(?:^|\/)packages\/([^/]+)\/(.+)$/.exec(filename.replace(/\\/g, '/'));
  return match ? { pkg: match[1], path: match[2] } : undefined;
}

function isBrowserFacing(filename) {
  const location = splitPackagePath(filename);
  if (!location) {
    return false;
  }

  const scope = BROWSER_FACING[location.pkg];
  if (!scope) {
    return false;
  }

  if (scope === true) {
    return location.path.startsWith('src/') || location.path.startsWith('addon/');
  }

  return scope.some(prefix => location.path === prefix || location.path.startsWith(`${prefix}/`));
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce importing span-start APIs from `@sentry/core/browser` in browser-facing code',
      category: 'Possible Errors',
      recommended: true,
    },
    fixable: null,
    schema: [],
    messages: {
      unguardedSpanApi:
        '`{{name}}` must be imported from `@sentry/core/browser` (or `@sentry/browser`) in browser-facing code. The `{{source}}` variant does not install `spanStreamingIntegration`, so spans it starts are created but never sent.',
    },
  },
  create: function (context) {
    if (!isBrowserFacing(context.getFilename())) {
      return {};
    }

    return {
      ImportDeclaration(node) {
        // `import type { startSpan }` is only ever used for signatures, never to start a span.
        if (node.importKind === 'type' || !RESTRICTED_SOURCES.includes(node.source.value)) {
          return;
        }

        for (const specifier of node.specifiers) {
          if (
            specifier.type === 'ImportSpecifier' &&
            specifier.importKind !== 'type' &&
            SPAN_START_APIS.includes(specifier.imported.name)
          ) {
            context.report({
              node: specifier,
              messageId: 'unguardedSpanApi',
              data: { name: specifier.imported.name, source: node.source.value },
            });
          }
        }
      },
    };
  },
};
