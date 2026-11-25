'use strict';

/**
 * @fileoverview Rule to require `safeUnref()` or `.unref()` on `setTimeout` / `setInterval` timers in
 * code that can run on a server runtime.
 *
 * A timer that is not unref'd keeps a Node or Bun process alive until it fires, so CLI tools and
 * scripts using the SDK do not exit when their own work is done.
 *
 * A timer counts as unref'd when it is passed straight to `safeUnref()` / `_INTERNAL_safeUnref()` /
 * `Deno.unrefTimer()`, when `.unref()` is called on the call result, or when it is assigned to a
 * variable or property that is unref'd anywhere in the same file.
 *
 * Browser-facing code (see `utils/browser-facing.js`), `*.client.*` entry files, and runtimes whose
 * timers cannot be unref'd and whose lifetime the platform controls (Cloudflare Workers, Vercel Edge)
 * are out of scope. `core` is in scope because every server SDK runs it.
 */

const { isBrowserFacing, splitPackagePath } = require('../utils/browser-facing');

const OUT_OF_SCOPE_PACKAGES = new Set(['cloudflare', 'vercel-edge', 'integration-shims', 'replay-worker']);

const TIMER_FUNCTIONS = new Set(['setTimeout', 'setInterval']);

const GLOBAL_OBJECTS = new Set(['global', 'globalThis', 'GLOBAL_OBJ']);

const UNREF_HELPERS = ['safeUnref', '_INTERNAL_safeUnref'];

const TS_WRAPPERS = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
  'ParenthesizedExpression',
]);

function isInScope(filename) {
  const location = splitPackagePath(filename);
  if (!location || !location.path.startsWith('src/') || OUT_OF_SCOPE_PACKAGES.has(location.pkg)) {
    return false;
  }
  return !isBrowserFacing(filename) && !/\.client\.[cm]?[jt]sx?$/.test(location.path);
}

function unwrap(node) {
  let current = node;
  while (current && TS_WRAPPERS.has(current.type)) {
    current = current.expression;
  }
  return current;
}

/** The outermost expression that only wraps `node` in type assertions or parentheses. */
function outermost(node) {
  let current = node;
  while (current.parent && TS_WRAPPERS.has(current.parent.type)) {
    current = current.parent;
  }
  return current;
}

/** A stable name for `timer`, `this._timer` or `channel[KEY]`, so assignments and unref calls can be matched. */
function targetKey(node) {
  const target = unwrap(node);
  if (!target) {
    return undefined;
  }
  if (target.type === 'Identifier') {
    return target.name;
  }
  if (target.type === 'ThisExpression') {
    return 'this';
  }
  if (target.type === 'MemberExpression') {
    const object = targetKey(target.object);
    const property = target.property;
    if (!object) {
      return undefined;
    }
    if (!target.computed && (property.type === 'Identifier' || property.type === 'PrivateIdentifier')) {
      return `${object}.${property.type === 'PrivateIdentifier' ? '#' : ''}${property.name}`;
    }
    if (target.computed && property.type === 'Identifier') {
      return `${object}[${property.name}]`;
    }
  }
  return undefined;
}

function isTimerCall(node) {
  const callee = node.callee;
  if (callee.type === 'Identifier') {
    return TIMER_FUNCTIONS.has(callee.name);
  }
  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object.type === 'Identifier' &&
    GLOBAL_OBJECTS.has(callee.object.name) &&
    callee.property.type === 'Identifier' &&
    TIMER_FUNCTIONS.has(callee.property.name)
  );
}

function isMember(node, objectName, propertyName) {
  return (
    node.type === 'MemberExpression' &&
    !node.computed &&
    node.property.type === 'Identifier' &&
    node.property.name === propertyName &&
    (objectName === undefined || (node.object.type === 'Identifier' && node.object.name === objectName))
  );
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require `safeUnref()` or `.unref()` on timers in code that can run on a server runtime',
      category: 'Possible Errors',
      recommended: true,
    },
    fixable: null,
    schema: [],
    messages: {
      timerNotUnrefed:
        "`{{name}}()` timers must be unref'd with `safeUnref()` (or `.unref()`) in code that can run on a server runtime. Otherwise the timer keeps CLI tools and scripts from exiting.",
    },
  },
  create: function (context) {
    if (!isInScope(context.getFilename())) {
      return {};
    }

    const unrefHelpers = new Set(UNREF_HELPERS);
    const unrefedKeys = new Set();
    const assignedTimers = [];

    function isUnrefHelper(callee) {
      return (callee.type === 'Identifier' && unrefHelpers.has(callee.name)) || isMember(callee, 'Deno', 'unrefTimer');
    }

    /** Whether `node` is the argument of an unref helper or the object of a `.unref()` call. */
    function isUnrefedDirectly(node) {
      const expression = outermost(node);
      const parent = expression.parent;
      if (parent.type === 'CallExpression' && parent.arguments[0] === expression) {
        return isUnrefHelper(parent.callee);
      }
      return (
        isMember(parent, undefined, 'unref') &&
        parent.object === expression &&
        parent.parent.type === 'CallExpression' &&
        parent.parent.callee === parent
      );
    }

    /** The variable or property a timer is stored in, if any. */
    function assignmentTarget(node) {
      const expression = outermost(node);
      const parent = expression.parent;
      if (parent.type === 'VariableDeclarator' && parent.init === expression) {
        return targetKey(parent.id);
      }
      if (parent.type === 'AssignmentExpression' && parent.operator === '=' && parent.right === expression) {
        return targetKey(parent.left);
      }
      return undefined;
    }

    function report(node) {
      const callee = node.callee;
      context.report({
        node,
        messageId: 'timerNotUnrefed',
        data: { name: callee.type === 'Identifier' ? callee.name : callee.property.name },
      });
    }

    return {
      ImportSpecifier(node) {
        if (node.imported.type === 'Identifier' && UNREF_HELPERS.includes(node.imported.name)) {
          unrefHelpers.add(node.local.name);
        }
      },
      CallExpression(node) {
        const callee = node.callee;

        const unrefed = isUnrefHelper(callee)
          ? node.arguments[0]
          : isMember(callee, undefined, 'unref') && callee.object;
        const unrefedKey = unrefed && targetKey(unrefed);
        unrefedKey && unrefedKeys.add(unrefedKey);

        if (!isTimerCall(node) || isUnrefedDirectly(node)) {
          return;
        }

        const key = assignmentTarget(node);
        if (key) {
          assignedTimers.push({ node, key });
        } else {
          report(node);
        }
      },
      'Program:exit'() {
        for (const { node, key } of assignedTimers) {
          if (!unrefedKeys.has(key)) {
            report(node);
          }
        }
      },
    };
  },
};
