/**
 * @fileoverview Rule to disallow using class field initializers.
 * @author Francesco Novy
 *
 * Based on https://github.com/jsx-eslint/eslint-plugin-react/blob/master/lib/rules/state-in-constructor.js
 */

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'disallow usage of class field initializers, because they producer larger bundle size.',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      forbidden: 'Avoid using class field initializers',
    },
    fixable: null,
    schema: [],
  },

  create(context) {
    return {
      'ClassProperty, PropertyDefinition'(node) {
        // We do allow arrow functions being initialized directly
        if (
          !node.static &&
          node.value !== null &&
          node.value.type !== 'ArrowFunctionExpression' &&
          node.value.type !== 'FunctionExpression' &&
          node.value.type !== 'CallExpression'
        ) {
          context.report({
            node,
            message: `Avoid class field initializers. Property "${node.key.name}" should be initialized in the constructor.`,
          });
        }
      },
    };
  },
};
