'use strict';

/**
 * This rule was created to flag usages of the RegExp constructor.
 * It is fine to use `new RegExp` if it is necessary and safe to do so.
 * "safe" means, that the regular expression is NOT created from unchecked or unescaped user input.
 * Avoid creating regular expressions from user input, because it can lead to invalid expressions or vulnerabilities.
 */
module.exports = {
  meta: {
    docs: {
      description:
        "Avoid using `new RegExp` constructor to ensure we don't accidentally create invalid or dangerous regular expressions from user input.",
    },
    schema: [],
  },
  create: function (context) {
    return {
      NewExpression(node) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'RegExp') {
          context.report({
            node,
            message: 'Avoid using the RegExp() constructor with unsafe user input.',
          });
        }
      },
    };
  },
};
