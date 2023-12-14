/**
 * Taken and adapted from https://github.com/nkt/eslint-plugin-es5/blob/master/src/rules/no-es6-methods.js
 */

module.exports = {
  meta: {
    docs: {
      description: 'Forbid methods added in ES6 which are not polyfilled by Sentry.',
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        if (!node.callee || !node.callee.property) {
          return;
        }
        const functionName = node.callee.property.name;

        const es6ArrayFunctions = ['copyWithin', 'values', 'fill'];
        const es6StringFunctions = ['repeat'];

        const es6Functions = [].concat(es6ArrayFunctions, es6StringFunctions);
        if (es6Functions.indexOf(functionName) > -1) {
          context.report({
            node: node.callee.property,
            message: `ES6 methods not allowed: ${functionName}`,
          });
        }
      },
    };
  },
};
