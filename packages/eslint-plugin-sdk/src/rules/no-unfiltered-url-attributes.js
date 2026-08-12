'use strict';

/**
 * URL attributes carry the request query string, which `dataCollection.urlQueryParams` is supposed to
 * gate. Filtering happens at the write site rather than centrally, so that a URL a user attaches
 * themselves is left alone — which also means a site that forgets to filter leaks silently.
 *
 * This rule requires every SDK-set URL attribute to go through `filterCollectedUrl` /
 * `filterCollectedUrlQuery`. Values that cannot contain a query string (a bare pathname, a route
 * template, a string literal) are fine — disable the rule on that line and say why.
 */

// Attribute keys that carry a query string, by constant name and by literal value.
const GUARDED_ATTRIBUTES = new Set(['URL_FULL', 'URL_QUERY', 'HTTP_TARGET', 'url.full', 'url.query', 'http.target']);

// Helpers that apply `dataCollection.urlQueryParams`.
const FILTER_FUNCTIONS = new Set([
  'filterCollectedUrl',
  'filterCollectedUrlQuery',
  '_INTERNAL_filterCollectedUrl',
  '_INTERNAL_filterCollectedUrlQuery',
  'filterUrlQuery',
  'filterQueryParams',
  '_INTERNAL_filterQueryParams',
  'normalizeAndFilterQueryString',
]);

// Helpers that remove the query string outright, so there is nothing left to filter.
const SANITIZING_FUNCTIONS = new Set([
  'stripUrlQueryAndFragment',
  'getSanitizedUrlString',
  'getSanitizedUrlStringFromUrlObject',
  'stripDataUrlContent',
  // react-router helper; returns `new URL(...).pathname`
  'getPathFromRequest',
]);

/** Resolves the attribute name a key node refers to, whether it is `[URL_FULL]` or `'url.full'`. */
function getAttributeName(keyNode, computed) {
  if (computed && keyNode.type === 'Identifier') {
    return keyNode.name;
  }
  if (keyNode.type === 'Literal' && typeof keyNode.value === 'string') {
    return keyNode.value;
  }
  return undefined;
}

/**
 * Whether a value expression routes through one of the filter helpers. Walks conditionals and
 * logical expressions so that `a ?? filterCollectedUrl(b)` and `cond ? filterCollectedUrl(a) : b`
 * count as filtered on the branches that matter.
 */
function isFiltered(node, safeNames) {
  if (!node) {
    return false;
  }

  switch (node.type) {
    case 'CallExpression': {
      const callee = node.callee;
      const name =
        callee.type === 'Identifier'
          ? callee.name
          : // e.g. `Sentry.filterCollectedUrl(...)`
            callee.type === 'MemberExpression' && callee.property.type === 'Identifier'
            ? callee.property.name
            : undefined;
      return !!name && (FILTER_FUNCTIONS.has(name) || SANITIZING_FUNCTIONS.has(name));
    }
    // A local holding an already-filtered value, e.g. `const q = filterCollectedUrlQuery(...)`.
    case 'Identifier':
      return safeNames.has(node.name);
    case 'ConditionalExpression':
      return isFiltered(node.consequent, safeNames) || isFiltered(node.alternate, safeNames);
    case 'LogicalExpression':
      return isFiltered(node.left, safeNames) || isFiltered(node.right, safeNames);
    case 'TSAsExpression':
    case 'TSNonNullExpression':
    case 'AwaitExpression':
      return isFiltered(node.expression, safeNames);
    default:
      return false;
  }
}

/** Values that can never carry a query string do not need filtering. */
function isTriviallySafe(node) {
  if (!node) {
    return true;
  }
  // String and regex literals are fixed values written by us. A regex means the object is a matcher
  // (e.g. an ignore-list entry), not a span attribute being set.
  if (node.type === 'Literal') {
    return true;
  }
  if (node.type === 'NewExpression' && node.callee.type === 'Identifier' && node.callee.name === 'RegExp') {
    return true;
  }
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return true;
  }
  if (node.type === 'Identifier' && node.name === 'undefined') {
    return true;
  }
  return false;
}

/** Collects locals initialised from a filtering or sanitizing helper, so `const x = filter(...)` counts. */
function collectSafeLocals(node, safeNames) {
  if (node.id.type === 'Identifier' && isFiltered(node.init, safeNames)) {
    safeNames.add(node.id.name);
  }
}

module.exports = {
  meta: {
    docs: {
      description:
        'Require URL span attributes to be filtered with `filterCollectedUrl` so that `dataCollection.urlQueryParams` is respected.',
    },
    schema: [],
  },
  create: function (context) {
    // Names of locals known to hold an already-filtered value. Declarations are visited before the
    // attribute writes that use them in every real-world ordering, so a single pass is enough.
    const safeNames = new Set();

    function check(node, keyNode, computed, valueNode) {
      const name = getAttributeName(keyNode, computed);
      if (!name || !GUARDED_ATTRIBUTES.has(name)) {
        return;
      }
      if (isFiltered(valueNode, safeNames) || isTriviallySafe(valueNode)) {
        return;
      }

      context.report({
        node,
        message:
          `Wrap the value of \`${name}\` in \`filterCollectedUrl()\` (or \`filterCollectedUrlQuery()\` for ` +
          'query strings) so `dataCollection.urlQueryParams` is applied. If this value can never contain a ' +
          'query string, disable this rule on the line and explain why.',
      });
    }

    return {
      VariableDeclarator(node) {
        collectSafeLocals(node, safeNames);
      },
      // `{ [URL_FULL]: value }` and `{ 'url.full': value }`
      Property(node) {
        check(node, node.key, node.computed, node.value);
      },
      // `attributes[URL_FULL] = value`
      AssignmentExpression(node) {
        if (node.left.type !== 'MemberExpression') {
          return;
        }
        check(node, node.left.property, node.left.computed, node.right);
      },
    };
  },
};
