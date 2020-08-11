/**
 * @fileoverview Rule to disallow using async await
 * @author Abhijeet Prasad
 */
'use strict';

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'disallow usage of async await',
      category: 'Best Practices',
      recommended: true,
    },
    fixable: null,
    schema: [],
  },
  create: function(context) {
    // variables should be defined here

    //----------------------------------------------------------------------
    // Helpers
    //----------------------------------------------------------------------

    // any helper functions should go here or else delete this section

    //----------------------------------------------------------------------
    // Public
    //----------------------------------------------------------------------

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
