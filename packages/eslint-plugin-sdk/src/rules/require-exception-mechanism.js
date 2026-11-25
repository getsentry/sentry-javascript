'use strict';

/**
 * Every exception the SDK captures on its own needs a `mechanism` with `handled` and `type`, so the
 * event shows whether the error was handled and which integration caught it. Without it, the event
 * falls back to `{ type: 'generic', handled: true }`.
 *
 * Flags `captureException(...)` and `<anything>.captureException(...)` unless the hint (second
 * argument) is an object literal whose `mechanism` sets both `handled` and `type`. A `mechanism`
 * that is not an object literal (a variable or a call) is trusted, and so is a capture context
 * callback that returns `markEventUnhandled(scope, type)`. Public API wrappers that only
 * pass a hint through, or code that sets the mechanism another way (for example with
 * `addExceptionMechanism` in an event processor), should disable the rule on that line and say why.
 */

function getKeyName(property) {
  if (!property.computed && property.key.type === 'Identifier') {
    return property.key.name;
  }
  if (property.key.type === 'Literal' && typeof property.key.value === 'string') {
    return property.key.value;
  }
  return undefined;
}

function findProperty(objectExpression, name) {
  return objectExpression.properties.find(property => property.type === 'Property' && getKeyName(property) === name);
}

function isCaptureException(callee) {
  if (callee.type === 'Identifier') {
    return callee.name === 'captureException';
  }
  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'captureException'
  );
}

// The serverless SDKs set the mechanism with this helper, which adds `{ handled: false, type }` in an event processor.
function isMarkEventUnhandledCallback(hint) {
  if (hint.type !== 'ArrowFunctionExpression' && hint.type !== 'FunctionExpression') {
    return false;
  }

  let returned = hint.body;
  if (returned.type === 'BlockStatement') {
    const lastStatement = returned.body[returned.body.length - 1];
    returned = lastStatement && lastStatement.type === 'ReturnStatement' ? lastStatement.argument : undefined;
  }

  return (
    !!returned &&
    returned.type === 'CallExpression' &&
    returned.callee.type === 'Identifier' &&
    returned.callee.name === 'markEventUnhandled' &&
    returned.arguments.length === 2
  );
}

/** Returns the missing mechanism keys, or `undefined` when the mechanism is complete or not statically visible. */
function getMissingKeys(hint) {
  if (hint && isMarkEventUnhandledCallback(hint)) {
    return undefined;
  }

  if (!hint || hint.type !== 'ObjectExpression') {
    return 'mechanism';
  }

  const mechanism = findProperty(hint, 'mechanism');
  if (!mechanism) {
    return 'mechanism';
  }

  if (mechanism.value.type !== 'ObjectExpression') {
    return undefined;
  }

  const missing = ['handled', 'type'].filter(key => !findProperty(mechanism.value, key));
  return missing.length ? `mechanism.${missing.join(' and mechanism.')}` : undefined;
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require `captureException` calls in SDK code to set `mechanism.handled` and `mechanism.type`.',
    },
    schema: [],
    messages: {
      missingMechanism:
        '`captureException` is missing `{{missing}}`. Pass `{ mechanism: { handled, type } }` as the hint, with `type` naming the integration and part that caught the error (same format as span origins).',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (!isCaptureException(node.callee)) {
          return;
        }

        const missing = getMissingKeys(node.arguments[1]);
        if (missing) {
          context.report({ node, messageId: 'missingMechanism', data: { missing } });
        }
      },
    };
  },
};
