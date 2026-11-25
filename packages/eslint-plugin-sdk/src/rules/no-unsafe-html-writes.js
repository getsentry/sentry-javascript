'use strict';

/**
 * Flags writes that parse a string as HTML: assigning `innerHTML` / `outerHTML`, and calling
 * `insertAdjacentHTML()` or `document.write()` / `document.writeln()`.
 * The SDK runs inside customer pages, so any of these can turn data into an XSS sink.
 * Reading `innerHTML` / `outerHTML` is fine.
 */

const HTML_PROPERTIES = new Set(['innerHTML', 'outerHTML']);
const DOCUMENT_WRITE_METHODS = new Set(['write', 'writeln']);

function getPropertyName(node) {
  if (!node.computed && node.property.type === 'Identifier') {
    return node.property.name;
  }
  if (node.computed && node.property.type === 'Literal' && typeof node.property.value === 'string') {
    return node.property.value;
  }
  return undefined;
}

function isDocument(node) {
  if (node.type === 'Identifier') {
    return node.name === 'document';
  }
  return node.type === 'MemberExpression' && getPropertyName(node) === 'document';
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow writing HTML strings into the DOM (`innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`).',
    },
    schema: [],
    messages: {
      htmlProperty: 'Do not assign `{{name}}`. Build DOM nodes with `createElement` / `textContent` instead.',
      htmlMethod: 'Do not call `{{name}}()`. Build DOM nodes with `createElement` / `textContent` instead.',
    },
  },
  create(context) {
    return {
      AssignmentExpression(node) {
        if (node.left.type !== 'MemberExpression') {
          return;
        }
        const name = getPropertyName(node.left);
        if (name && HTML_PROPERTIES.has(name)) {
          context.report({ node, messageId: 'htmlProperty', data: { name } });
        }
      },
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== 'MemberExpression') {
          return;
        }
        const name = getPropertyName(callee);
        if (name === 'insertAdjacentHTML') {
          context.report({ node, messageId: 'htmlMethod', data: { name } });
        } else if (name && DOCUMENT_WRITE_METHODS.has(name) && isDocument(callee.object)) {
          context.report({ node, messageId: 'htmlMethod', data: { name: `document.${name}` } });
        }
      },
    };
  },
};
