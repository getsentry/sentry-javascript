'use strict';

/**
 * @fileoverview Rule to enforce wrapping random/time APIs with withRandomSafeContext
 *
 * This rule detects uses of APIs that generate random values or time-based values
 * and ensures they are wrapped with `withRandomSafeContext()` to ensure safe
 * random number generation in certain contexts (e.g., React Server Components with caching).
 */

// APIs that should be wrapped with withRandomSafeContext, with their specific messages
const UNSAFE_MEMBER_CALLS = [
  {
    object: 'Date',
    property: 'now',
    messageId: 'unsafeDateNow',
  },
  {
    object: 'Math',
    property: 'random',
    messageId: 'unsafeMathRandom',
  },
  {
    object: 'performance',
    property: 'now',
    messageId: 'unsafePerformanceNow',
  },
  {
    object: 'crypto',
    property: 'randomUUID',
    messageId: 'unsafeCryptoRandomUUID',
  },
  {
    object: 'crypto',
    property: 'getRandomValues',
    messageId: 'unsafeCryptoGetRandomValues',
  },
];

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce wrapping random/time APIs (Date.now, Math.random, performance.now, crypto.randomUUID) with withRandomSafeContext',
      category: 'Best Practices',
      recommended: true,
    },
    fixable: null,
    schema: [],
    messages: {
      unsafeDateNow:
        '`Date.now()` should be replaced with `safeDateNow()` from `@sentry/core` to ensure safe time value generation. You can disable this rule with an eslint-disable comment if this usage is intentional.',
      unsafeMathRandom:
        '`Math.random()` should be replaced with `safeMathRandom()` from `@sentry/core` to ensure safe random value generation. You can disable this rule with an eslint-disable comment if this usage is intentional.',
      unsafePerformanceNow:
        '`performance.now()` should be wrapped with `withRandomSafeContext()` to ensure safe time value generation. Use: `withRandomSafeContext(() => performance.now())`. You can disable this rule with an eslint-disable comment if this usage is intentional.',
      unsafeCryptoRandomUUID:
        '`crypto.randomUUID()` should be wrapped with `withRandomSafeContext()` to ensure safe random value generation. Use: `withRandomSafeContext(() => crypto.randomUUID())`. You can disable this rule with an eslint-disable comment if this usage is intentional.',
      unsafeCryptoGetRandomValues:
        '`crypto.getRandomValues()` should be wrapped with `withRandomSafeContext()` to ensure safe random value generation. Use: `withRandomSafeContext(() => crypto.getRandomValues(...))`. You can disable this rule with an eslint-disable comment if this usage is intentional.',
    },
  },
  create: function (context) {
    /**
     * Check if a node is inside a withRandomSafeContext call
     */
    function isInsidewithRandomSafeContext(node) {
      let current = node.parent;

      while (current) {
        // Check if we're inside a callback passed to withRandomSafeContext
        if (
          current.type === 'CallExpression' &&
          current.callee.type === 'Identifier' &&
          current.callee.name === 'withRandomSafeContext'
        ) {
          return true;
        }

        // Also check for arrow functions or regular functions passed to withRandomSafeContext
        if (
          (current.type === 'ArrowFunctionExpression' || current.type === 'FunctionExpression') &&
          current.parent?.type === 'CallExpression' &&
          current.parent.callee.type === 'Identifier' &&
          current.parent.callee.name === 'withRandomSafeContext'
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
          const unsafeApi = UNSAFE_MEMBER_CALLS.find(api => api.object === objectName && api.property === propertyName);

          if (unsafeApi && !isInsidewithRandomSafeContext(node)) {
            context.report({
              node,
              messageId: unsafeApi.messageId,
            });
          }
        }
      },
    };
  },
};
