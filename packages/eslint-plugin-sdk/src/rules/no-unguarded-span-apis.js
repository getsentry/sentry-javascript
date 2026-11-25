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

const { isBrowserFacing } = require('../utils/browser-facing');

const SPAN_START_APIS = ['startSpan', 'startInactiveSpan', 'startSpanManual', 'startIdleSpan'];

const RESTRICTED_SOURCES = ['@sentry/core', '@sentry/core/server'];

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
