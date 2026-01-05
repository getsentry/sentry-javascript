'use strict';

/**
 * @fileoverview Rule to enforce wrapping random/time APIs with runInRandomSafeContext
 *
 * This rule detects uses of APIs that generate random values or time-based values
 * and ensures they are wrapped with `runInRandomSafeContext()` to ensure safe
 * random number generation in certain contexts (e.g., React Server Components with caching).
 */

// APIs that should be wrapped with runInRandomSafeContext
const UNSAFE_MEMBER_CALLS = [
  { object: 'Date', property: 'now' },
  { object: 'Math', property: 'random' },
  { object: 'performance', property: 'now' },
  { object: 'crypto', property: 'randomUUID' },
  { object: 'crypto', property: 'getRandomValues' },
];

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce wrapping random/time APIs (Date.now, Math.random, performance.now, crypto.randomUUID) with runInRandomSafeContext',
      category: 'Best Practices',
      recommended: true,
    },
    fixable: null,
    schema: [],
    messages: {
      unsafeRandomApi:
        '{{ api }} should be wrapped with runInRandomSafeContext() to ensure safe random/time value generation. Use: runInRandomSafeContext(() => {{ api }}). You can disable this rule with an eslint-disable comment if this usage is intentional.',
    },
  },
  create: function (context) {
    /**
     * Check if a node is inside a runInRandomSafeContext call
     */
    function isInsideRunInRandomSafeContext(node) {
      let current = node.parent;

      while (current) {
        // Check if we're inside a callback passed to runInRandomSafeContext
        if (
          current.type === 'CallExpression' &&
          current.callee.type === 'Identifier' &&
          current.callee.name === 'runInRandomSafeContext'
        ) {
          return true;
        }

        // Also check for arrow functions or regular functions passed to runInRandomSafeContext
        if (
          (current.type === 'ArrowFunctionExpression' || current.type === 'FunctionExpression') &&
          current.parent?.type === 'CallExpression' &&
          current.parent.callee.type === 'Identifier' &&
          current.parent.callee.name === 'runInRandomSafeContext'
        ) {
          return true;
        }

        current = current.parent;
      }

      return false;
    }

    /**
     * Check if a node is inside the safeRandomGeneratorRunner.ts file (the definition file)
     */
    function isInSafeRandomGeneratorRunner(_node) {
      const filename = context.getFilename();
      return filename.includes('safeRandomGeneratorRunner');
    }

    return {
      CallExpression(node) {
        // Skip if we're in the safeRandomGeneratorRunner.ts file itself
        if (isInSafeRandomGeneratorRunner(node)) {
          return;
        }

        // Check for member expression calls like Date.now(), Math.random(), etc.
        if (node.callee.type === 'MemberExpression') {
          const callee = node.callee;

          // Get the object name (e.g., 'Date', 'Math', 'performance', 'crypto')
          let objectName = null;
          if (callee.object.type === 'Identifier') {
            objectName = callee.object.name;
          }

          // Get the property name (e.g., 'now', 'random', 'randomUUID')
          let propertyName = null;
          if (callee.property.type === 'Identifier') {
            propertyName = callee.property.name;
          } else if (callee.computed && callee.property.type === 'Literal') {
            propertyName = callee.property.value;
          }

          if (!objectName || !propertyName) {
            return;
          }

          // Check if this is one of the unsafe APIs
          const isUnsafeApi = UNSAFE_MEMBER_CALLS.some(
            api => api.object === objectName && api.property === propertyName,
          );

          if (isUnsafeApi && !isInsideRunInRandomSafeContext(node)) {
            context.report({
              node,
              messageId: 'unsafeRandomApi',
              data: {
                api: `${objectName}.${propertyName}()`,
              },
            });
          }
        }
      },
    };
  },
};
