'use strict';

/**
 * @fileoverview Rule to require a `DEBUG_BUILD` gate on `debug.log` / `debug.warn` / `debug.error`
 * calls in code that ships to the browser.
 *
 * Production bundles replace `DEBUG_BUILD` with `false`, so gated calls are dropped together with
 * their message strings. Ungated calls are no-ops at runtime but their strings still ship.
 *
 * A call counts as gated when it is the right-hand side of `DEBUG_BUILD && ...`, inside the
 * consequent of `if (DEBUG_BUILD)` or `DEBUG_BUILD ? ... : ...`, or after an
 * `if (!DEBUG_BUILD) return;` in an enclosing block. All of these are removed by minifiers alike.
 */

const { isBrowserFacing, splitPackagePath } = require('../utils/browser-facing');

const GATES = new Set(['DEBUG_BUILD', 'IS_DEBUG_BUILD', '__DEBUG_BUILD__']);

const LOG_METHODS = new Set(['log', 'warn', 'error']);

/** `core` is shared with server runtimes, but everything the browser SDK uses comes from it. */
function isInScope(filename) {
  if (isBrowserFacing(filename)) {
    return true;
  }
  const location = splitPackagePath(filename);
  return !!location && location.pkg === 'core' && location.path.startsWith('src/');
}

/** Whether `test` is truthy only if a gate is, i.e. a gate or a `&&` chain containing one. */
function isGate(test) {
  if (test.type === 'Identifier') {
    return GATES.has(test.name);
  }
  if (test.type === 'LogicalExpression' && test.operator === '&&') {
    return isGate(test.left) || isGate(test.right);
  }
  return false;
}

/** `if (!DEBUG_BUILD) return;` (or `throw`, or a block of those). */
function isNegatedGateExit(statement) {
  if (
    statement.type !== 'IfStatement' ||
    statement.alternate ||
    statement.test.type !== 'UnaryExpression' ||
    statement.test.operator !== '!' ||
    !isGate(statement.test.argument)
  ) {
    return false;
  }
  const exit =
    statement.consequent.type === 'BlockStatement'
      ? statement.consequent.body[statement.consequent.body.length - 1]
      : statement.consequent;
  return !!exit && (exit.type === 'ReturnStatement' || exit.type === 'ThrowStatement');
}

function isGuardedBy(parent, child) {
  switch (parent.type) {
    case 'LogicalExpression':
      return parent.operator === '&&' && parent.right === child && isGate(parent.left);
    case 'IfStatement':
    case 'ConditionalExpression':
      return parent.consequent === child && isGate(parent.test);
    case 'Program':
    case 'BlockStatement':
    case 'StaticBlock':
    case 'SwitchCase': {
      const statements = parent.type === 'SwitchCase' ? parent.consequent : parent.body;
      const index = statements.indexOf(child);
      return statements.slice(0, index).some(isNegatedGateExit);
    }
    default:
      return false;
  }
}

function isGuarded(node) {
  let child = node;
  let parent = node.parent;
  while (parent) {
    if (isGuardedBy(parent, child)) {
      return true;
    }
    child = parent;
    parent = parent.parent;
  }
  return false;
}

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Require a `DEBUG_BUILD` gate on `debug.*` logging calls in browser-facing code',
      category: 'Best Practices',
      recommended: true,
    },
    fixable: null,
    schema: [],
    messages: {
      unguardedDebugLog:
        '`{{callee}}()` must be gated with `DEBUG_BUILD && {{callee}}(...)`. Without the gate its message ships in production bundles.',
    },
  },
  create: function (context) {
    if (!isInScope(context.getFilename())) {
      return {};
    }

    const debugNames = new Set(['debug']);

    return {
      ImportSpecifier(node) {
        if (node.imported.type === 'Identifier' && node.imported.name === 'debug') {
          debugNames.add(node.local.name);
        }
      },
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type !== 'MemberExpression' ||
          callee.computed ||
          callee.object.type !== 'Identifier' ||
          !debugNames.has(callee.object.name) ||
          callee.property.type !== 'Identifier' ||
          !LOG_METHODS.has(callee.property.name) ||
          isGuarded(node)
        ) {
          return;
        }

        context.report({
          node,
          messageId: 'unguardedDebugLog',
          data: { callee: `${callee.object.name}.${callee.property.name}` },
        });
      },
    };
  },
};
