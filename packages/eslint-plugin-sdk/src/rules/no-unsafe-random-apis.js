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
  if (property.type === 'Literal' && typeof property.value === 'string') {
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

function findUnsafeApi(objectName, propertyName) {
  return UNSAFE_MEMBER_CALLS.find(api => api.object === objectName && api.property === propertyName);
}

function getUnsafeApiForMember(node) {
  const member = unwrap(node);
  if (member?.type !== 'MemberExpression') {
    return undefined;
  }
  return findUnsafeApi(getObjectName(member.object), getPropertyName(member));
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

/**
 * Whether a reference to an unsafe function (not a call of it) hands the function to other code,
 * which may call it outside of withRandomSafeContext, e.g. `const now = performance.now` or
 * `performance.now.bind(performance)`. Existence checks like `if (crypto.randomUUID)` are fine.
 */
function isEscapingReference(node) {
  let child = node;
  let parent = node.parent;

  while (
    parent &&
    (TRANSPARENT_WRAPPERS.includes(parent.type) ||
      parent.type === 'LogicalExpression' ||
      (parent.type === 'ConditionalExpression' && parent.test !== child))
  ) {
    child = parent;
    parent = parent.parent;
  }

  switch (parent?.type) {
    case 'MemberExpression':
      return parent.object === child && ['bind', 'call', 'apply'].includes(getPropertyName(parent));
    case 'CallExpression':
    case 'NewExpression':
      return parent.arguments.includes(child);
    case 'Property':
      return parent.value === child;
    case 'AssignmentExpression':
    case 'AssignmentPattern':
      return parent.right === child;
    case 'VariableDeclarator':
      return parent.init === child;
    case 'PropertyDefinition':
    case 'ReturnStatement':
    case 'ArrowFunctionExpression':
    case 'ArrayExpression':
    case 'SpreadElement':
      return true;
    default:
      return false;
  }
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
      unsafeReference:
        '`{{name}}` is passed around without being called, so it can end up being called outside of `withRandomSafeContext()`. Call it inside `withRandomSafeContext(() => ...)` instead. You can disable this rule with an eslint-disable comment if this usage is intentional.',
    },
  },
  create: function (context) {
    function report(node, api, asReference) {
      if (isInsideWithRandomSafeContext(node)) {
        return;
      }
      if (asReference) {
        context.report({ node, messageId: 'unsafeReference', data: { name: `${api.object}.${api.property}` } });
      } else {
        context.report({ node, messageId: api.messageId });
      }
    }

    return {
      CallExpression(node) {
        const api = getUnsafeApiForMember(node.callee);
        if (api) {
          report(node, api, false);
        }
      },
      MemberExpression(node) {
        const api = getUnsafeApiForMember(node);
        if (!api) {
          return;
        }

        let outer = node;
        while (outer.parent && TRANSPARENT_WRAPPERS.includes(outer.parent.type)) {
          outer = outer.parent;
        }
        // Calls are reported by the CallExpression visitor
        if (outer.parent?.type === 'CallExpression' && outer.parent.callee === outer) {
          return;
        }

        if (isEscapingReference(outer)) {
          report(node, api, true);
        }
      },
      // `const { now } = performance`
      VariableDeclarator(node) {
        if (!node.init || node.id.type !== 'ObjectPattern') {
          return;
        }
        const objectName = getObjectName(node.init);
        for (const property of node.id.properties) {
          if (property.type !== 'Property' || property.computed || property.key.type !== 'Identifier') {
            continue;
          }
          const api = findUnsafeApi(objectName, property.key.name);
          if (api) {
            report(property, api, true);
          }
        }
      },
      // Flag the `new Date()` constructor with no arguments, which reads the ambient clock.
      // `new Date(<number>)` is safe because it does not read the current time.
      NewExpression(node) {
        if (
          node.arguments.length === 0 &&
          getObjectName(node.callee) === 'Date' &&
          !isInsideWithRandomSafeContext(node)
        ) {
          context.report({ node, messageId: 'unsafeDateConstructor' });
        }
      },
    };
  },
};
