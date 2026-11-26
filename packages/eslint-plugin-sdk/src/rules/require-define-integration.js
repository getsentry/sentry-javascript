'use strict';

/**
 * @fileoverview Rule to require that integrations are created with `defineIntegration`.
 *
 * `defineIntegration` records the options an integration was created with on `_options`. An
 * integration that returns its object directly works, but its options are never recorded.
 *
 * Oxlint offers no type information to JS plugins, so the rule looks for the shape of an integration
 * instead: an object literal with a `name` and at least one integration hook. Such an object is fine
 * when the function that builds it reaches `defineIntegration` within the same file, either because
 * it is passed to it or because a function that is passed to it uses it.
 */

const { splitPackagePath } = require('../utils/browser-facing');

const INTEGRATION_HOOKS = new Set([
  'setupOnce',
  'beforeSetup',
  'setup',
  'afterAllSetup',
  'preprocessEvent',
  'processEvent',
  'processSpan',
  'processSegmentSpan',
]);

/**
 * Bundler and framework plugins are also `{ name, setup }` objects, so the files that define them are
 * skipped. Paths are relative to `packages/`.
 */
const PLUGIN_PATHS = [
  /^bundler-plugins\//,
  /^server-runtime-injection\//,
  /^bun\/src\/plugin\.ts$/,
  /^nitro\/src\/(?:module|orchestrion)\.ts$/,
  /^node\/src\/bundler-plugin\//,
  /^nuxt\/src\/runtime\/plugins\//,
  /^server-utils\/src\/orchestrion\/bundler\//,
  /^tanstackstart-react\/src\/vite\//,
];

const TRANSPARENT_WRAPPERS = new Set([
  'TSSatisfiesExpression',
  'TSAsExpression',
  'TSNonNullExpression',
  'ParenthesizedExpression',
]);

const FUNCTIONS = new Set(['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration']);

function isPluginFile(filename) {
  const location = splitPackagePath(filename);
  if (!location) {
    return false;
  }

  const path = `${location.pkg}/${location.path}`;

  return PLUGIN_PATHS.some(pattern => pattern.test(path));
}

function isDefineIntegrationCall(node) {
  if (node.type !== 'CallExpression') {
    return false;
  }

  const callee = node.callee;

  return (
    (callee.type === 'Identifier' && callee.name === 'defineIntegration') ||
    (callee.type === 'MemberExpression' && !callee.computed && callee.property.name === 'defineIntegration')
  );
}

function getPropertyName(property) {
  if (property.type !== 'Property' || property.computed) {
    return undefined;
  }

  return property.key.type === 'Identifier' ? property.key.name : property.key.value;
}

/** The name a function can be referred to by: its own, or the variable it is assigned to. */
function getFunctionName(node) {
  if (node.id) {
    return node.id.name;
  }

  let parent = node.parent;
  while (parent && TRANSPARENT_WRAPPERS.has(parent.type)) {
    parent = parent.parent;
  }

  return parent?.type === 'VariableDeclarator' && parent.id.type === 'Identifier' ? parent.id.name : undefined;
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require integrations to be created with `defineIntegration`',
      category: 'Possible Errors',
      recommended: true,
    },
    fixable: null,
    schema: [],
    messages: {
      requireDefineIntegration:
        'Integrations must be created with `defineIntegration`. Without it, the options the integration was created with are not recorded.',
    },
  },
  create: function (context) {
    if (isPluginFile(context.getFilename())) {
      return {};
    }

    /** Names used inside a `defineIntegration(...)` call. */
    const defined = new Set();
    /** Names used inside each named function, to follow helpers that build the object. */
    const usedByFunction = new Map();
    const candidates = [];

    /** Names of the functions around `node`, or `undefined` when it is inside `defineIntegration(...)`. */
    function getEnclosingFunctionNames(node) {
      const names = [];
      for (let parent = node.parent; parent; parent = parent.parent) {
        if (isDefineIntegrationCall(parent)) {
          return undefined;
        }

        const name = FUNCTIONS.has(parent.type) ? getFunctionName(parent) : undefined;
        if (name) {
          names.push(name);
        }
      }

      return names;
    }

    return {
      Identifier(node) {
        const functionNames = getEnclosingFunctionNames(node);
        if (!functionNames) {
          defined.add(node.name);

          return;
        }

        for (const functionName of functionNames) {
          if (!usedByFunction.has(functionName)) {
            usedByFunction.set(functionName, new Set());
          }
          usedByFunction.get(functionName).add(node.name);
        }
      },

      ObjectExpression(node) {
        const names = node.properties.map(getPropertyName);
        if (!names.includes('name') || !names.some(name => INTEGRATION_HOOKS.has(name))) {
          return;
        }

        const functionNames = getEnclosingFunctionNames(node);
        if (functionNames) {
          candidates.push({ node, functionNames });
        }
      },

      'Program:exit'() {
        const pending = [...defined];
        while (pending.length) {
          for (const name of usedByFunction.get(pending.pop()) || []) {
            if (!defined.has(name)) {
              defined.add(name);
              pending.push(name);
            }
          }
        }

        for (const { node, functionNames } of candidates) {
          if (!functionNames.some(name => defined.has(name))) {
            context.report({ node, messageId: 'requireDefineIntegration' });
          }
        }
      },
    };
  },
};
