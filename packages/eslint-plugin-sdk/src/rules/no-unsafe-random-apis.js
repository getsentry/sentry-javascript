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

// `@sentry/core` exports the wrapper as `_INTERNAL_withRandomSafeContext` to other packages
const WRAPPER_NAMES = ['withRandomSafeContext', '_INTERNAL_withRandomSafeContext'];

const TRANSPARENT_WRAPPERS = [
  'ChainExpression',
  'ParenthesizedExpression',
  'TSNonNullExpression',
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion',
];

function unwrap(node) {
  let current = node;
  while (current && TRANSPARENT_WRAPPERS.includes(current.type)) {
    current = current.expression;
  }
  return current;
}

function getPropertyName(memberExpression) {
  const property = memberExpression.property;
  if (!memberExpression.computed && property.type === 'Identifier') {
    return property.name;
  }
  if (memberExpression.computed && property.type === 'Literal') {
    return property.value;
  }
  return null;
}

/**
 * Returns the name of the global an expression refers to, e.g. `performance` for
 * `performance`, `globalThis.performance` or `GLOBAL_OBJ.performance`.
 */
function getObjectName(node) {
  const object = unwrap(node);
  if (object?.type === 'Identifier') {
    return object.name;
  }
  if (object?.type === 'MemberExpression') {
    return getPropertyName(object);
  }
  return null;
}

function getUnsafeApi(callee) {
  const member = unwrap(callee);
  if (member?.type !== 'MemberExpression') {
    return undefined;
  }
  const objectName = getObjectName(member.object);
  const propertyName = getPropertyName(member);
  return UNSAFE_MEMBER_CALLS.find(api => api.object === objectName && api.property === propertyName);
}

function isInsideWithRandomSafeContext(node) {
  let current = node.parent;
  while (current) {
    if (current.type === 'CallExpression') {
      const callee = unwrap(current.callee);
      if (callee.type === 'Identifier' && WRAPPER_NAMES.includes(callee.name)) {
        return true;
      }
    }
    current = current.parent;
  }
  return false;
}

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
      unsafeDateConstructor:
        '`new Date()` reads the ambient clock and should be replaced with `new Date(safeDateNow())` (with `safeDateNow()` from `@sentry/core`) to ensure safe time value generation. You can disable this rule with an eslint-disable comment if this usage is intentional.',
    },
  },
  create: function (context) {
    return {
      CallExpression(node) {
        const api = getUnsafeApi(node.callee);
        if (api && !isInsideWithRandomSafeContext(node)) {
          context.report({ node, messageId: api.messageId });
        }
      },
      // Flag the `new Date()` constructor with no arguments, which reads the ambient clock.
      // `new Date(<number>)` is safe because it does not read the current time.
      NewExpression(node) {
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'Date' &&
          node.arguments.length === 0 &&
          !isInsideWithRandomSafeContext(node)
        ) {
          context.report({ node, messageId: 'unsafeDateConstructor' });
        }
      },
    };
  },
};
