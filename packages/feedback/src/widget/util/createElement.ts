import { WINDOW } from '@sentry/browser';

/**
 * Helper function to create an element. Could be used as a JSX factory
 * (i.e. React-like syntax).
 */
export function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  attributes: { [key: string]: string | boolean | EventListenerOrEventListenerObject } | null,
  ...children: any
): HTMLElementTagNameMap[K] {
  const doc = WINDOW.document;
  const element = doc.createElement(tagName);

  if (attributes) {
    Object.entries(attributes).forEach(([attribute, attributeValue]) => {
      if (attribute === 'className' && typeof attributeValue === 'string') {
        // JSX does not allow class as a valid name
        element.setAttribute('class', attributeValue);
      } else if (typeof attributeValue === 'boolean' && attributeValue) {
        element.setAttribute(attribute, '');
      } else if (typeof attributeValue === 'string') {
        element.setAttribute(attribute, attributeValue);
      } else if (attribute.startsWith('on') && typeof attributeValue === 'function') {
        element.addEventListener(attribute.substring(2).toLowerCase(), attributeValue);
      }
    });
  }
  for (const child of children) {
    appendChild(element, child);
  }

  return element;
}

function appendChild(parent: Node, child: any): void {
  const doc = WINDOW.document;
  if (typeof child === 'undefined' || child === null) {
    return;
  }

  if (Array.isArray(child)) {
    for (const value of child) {
      appendChild(parent, value);
    }
  } else if (child === false) {
    // do nothing if child evaluated to false
  } else if (typeof child === 'string') {
    parent.appendChild(doc.createTextNode(child));
  } else if (child instanceof Node) {
    parent.appendChild(child);
  } else {
    parent.appendChild(doc.createTextNode(String(child)));
  }
}
