'use strict';

/**
 * @fileoverview Rule to allow direct `console.*` calls only inside a `consoleSandbox()` callback.
 *
 * The SDK instruments `console` to record breadcrumbs and logs. A direct `console.*` call from SDK
 * code goes through that instrumentation, so the SDK records its own output. `consoleSandbox()`
 * restores the original console methods while its callback runs. Debug output belongs on the
 * `debug` logger instead, which is stripped from non-debug builds.
 */

const FUNCTION_TYPES = ['ArrowFunctionExpression', 'FunctionExpression'];

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

/** Matches `consoleSandbox(...)` and `<anything>.consoleSandbox(...)`. */
function isConsoleSandboxCall(node) {
  if (node.type !== 'CallExpression') {
    return false;
  }
  const callee = unwrap(node.callee);
  if (callee.type === 'Identifier') {
    return callee.name === 'consoleSandbox';
  }
  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'consoleSandbox'
  );
}

function isInsideConsoleSandbox(node) {
  let child = node;
  let current = node.parent;
  while (current) {
    if (FUNCTION_TYPES.includes(child.type) && isConsoleSandboxCall(current) && current.arguments[0] === child) {
      return true;
    }
    child = current;
    current = current.parent;
  }
  return false;
}

/** A `console` that the file declares itself (e.g. `const console = GLOBAL_OBJ.console`) is not the global. */
function isShadowed(context, node) {
  let scope = context.sourceCode.getScope(node);
  while (scope) {
    const variable = scope.set.get('console');
    if (variable?.defs.length) {
      return true;
    }
    scope = scope.upper;
  }
  return false;
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Allow direct `console.*` calls only inside a `consoleSandbox()` callback',
      category: 'Best Practices',
      recommended: true,
    },
    fixable: null,
    schema: [],
    messages: {
      unsandboxedConsole:
        '`console.{{method}}` is only allowed inside a `consoleSandbox(() => ...)` callback, so the SDK does not capture its own output. Use the `debug` logger for debug output.',
    },
  },
  create: function (context) {
    return {
      MemberExpression(node) {
        const object = unwrap(node.object);
        if (object.type !== 'Identifier' || object.name !== 'console') {
          return;
        }

        if (isInsideConsoleSandbox(node) || isShadowed(context, node)) {
          return;
        }

        const method = !node.computed && node.property.type === 'Identifier' ? node.property.name : '*';
        context.report({ node, messageId: 'unsandboxedConsole', data: { method } });
      },
    };
  },
};
