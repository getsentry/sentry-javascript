'use strict';

/**
 * This rule was created to flag usages of the `.only` function in vitest and jest tests.
 * Usually, we don't want to commit focused tests as this causes other tests to be skipped.
 */
module.exports = {
  meta: {
    docs: {
      description: "Do not focus tests via `.only` to ensure we don't commit accidentally skip the other tests.",
    },
    schema: [],
  },
  create: function (context) {
    return {
      CallExpression(node) {
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.object.type === 'Identifier' &&
          ['test', 'it', 'describe'].includes(node.callee.object.name) &&
          node.callee.property.type === 'Identifier' &&
          node.callee.property.name === 'only'
        ) {
          context.report({
            node,
            message: "Do not focus tests via `.only` to ensure we don't commit accidentally skip the other tests.",
          });
        }
      },
    };
  },
};
