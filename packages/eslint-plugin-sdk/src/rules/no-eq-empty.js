/**
 * @fileoverview Rule to disallow using the equality operator with empty arrays or objects
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
      description: 'disallow using the equality operator with empty arrays or objects',
      category: 'Best Practices',
      recommended: true,
    },
    fixable: null,
    schema: [],
    messages: {
      equality: 'Do not apply the equality operator on an empty {{ name }}.{{ fix }}',
    },
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
      BinaryExpression(node) {
        if (node.operator === '==' || node.operator === '===') {
          if (node.left.type !== 'ArrayExpression' && node.right.type === 'ArrayExpression') {
            context.report({
              node,
              messageId: 'equality',
              data: {
                name: 'array',
                fix: ' Use .length or Array.isArray instead.',
              },
            });
          } else if (node.left.type !== 'ObjectExpression' && node.right.type === 'ObjectExpression') {
            context.report({
              node,
              messageId: 'equality',
              data: {
                name: 'object',
                fix: '',
              },
            });
          }
        }
      },
    };
  },
};
