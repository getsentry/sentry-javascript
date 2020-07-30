// This is a temporary file. It will be removed when we migrate
// the eslint configs to another repo.

'use strict';

/**
 * Rule to disallow usage of async await
 * @author Abhijeet Prasad
 */
const noAsyncAwait = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow usage of async await',
      category: 'Best Practices',
      recommended: true,
    },
    fixable: null,
    schema: [],
  },
  create: function(context) {
    return {
      FunctionDeclaration(node) {
        if (node.async) {
          context.report({
            node,
            message:
              'Using async-await can add a lot to bundle size. Please do not use it outside of tests, use Promises instead',
          });
        }
      },

      ArrowFunctionExpression(node) {
        if (node.async) {
          context.report({
            node,
            message:
              'Using async-await can add a lot to bundle size. Please do not use it outside of tests, use Promises instead',
          });
        }
      },
    };
  },
};

module.exports = {
  rules: {
    'no-async-await': noAsyncAwait,
  },
};
