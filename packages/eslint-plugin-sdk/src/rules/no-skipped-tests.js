'use strict';

/**
 * This rule was created to flag usages of the `.skip` function in vitest and jest tests.
 * Usually, we don't want to commit skipped tests as this causes other tests to be skipped.
 * Sometimes, skipping is valid (e.g. flaky tests), in which case, we can simply eslint-disable the rule.
 */
module.exports = {
  meta: {
    docs: {
      description: "Do not skip tests via `.skip` to ensure we don't commit accidentally skipped tests.",
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
          node.callee.property.name === 'skip'
        ) {
          context.report({
            node,
            message: "Do not skip tests via `.skip` to ensure we don't commit accidentally skipped tests.",
          });
        }
      },
    };
  },
};
