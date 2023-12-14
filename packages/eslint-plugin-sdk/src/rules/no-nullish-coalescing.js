/**
 * @fileoverview disallow nullish coalescing operators as they were introduced only in ES2020 and hence require
 * us to add a polyfill. This increases bundle size more than avoiding nullish coalescing operators all together.
 *
 * @author Lukas Stracke
 *
 * Based on: https://github.com/mysticatea/eslint-plugin-es/blob/v4.1.0/lib/rules/no-nullish-coalescing-operators.js
 */

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'disallow nullish coalescing operators.',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      forbidden: 'Avoid using nullish coalescing operators.',
    },
    fixable: null,
    schema: [],
  },
  create(context) {
    return {
      "LogicalExpression[operator='??']"(node) {
        context.report({
          node: context.getSourceCode().getTokenAfter(node.left, isNullishCoalescingOperator),
          messageId: 'forbidden',
        });
      },
    };
  },
};

/**
 * Checks if the given token is a nullish coalescing operator or not.
 * @param {Token} token - The token to check.
 * @returns {boolean} `true` if the token is a nullish coalescing operator.
 */
function isNullishCoalescingOperator(token) {
  return token.value === '??' && token.type === 'Punctuator';
}
