/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';
import { htmlTreeAsString } from '../src/htmlTreeAsString';

describe('htmlTreeAsString', () => {
  it('returns a query-selector-like string for a single element', () => {
    const el = document.createElement('button');
    el.id = 'submit';
    el.className = 'btn primary';

    expect(htmlTreeAsString(el)).toBe('button#submit.btn.primary');
  });

  it('walks the ancestor chain', () => {
    const parent = document.createElement('div');
    parent.id = 'app';
    const child = document.createElement('span');
    child.className = 'label';
    parent.appendChild(child);

    expect(htmlTreeAsString(child)).toBe('div#app > span.label');
  });

  it('does not invoke user-defined instance getters ', () => {
    const el = document.createElement('div');

    let idGetterInvoked = false;
    let classNameGetterInvoked = false;

    Object.defineProperty(el, 'id', {
      get() {
        idGetterInvoked = true;
        return 'trap';
      },
    });

    Object.defineProperty(el, 'className', {
      get() {
        classNameGetterInvoked = true;
        return 'trap-class';
      },
    });

    const result = htmlTreeAsString(el);

    expect(idGetterInvoked).toBe(false);
    expect(classNameGetterInvoked).toBe(false);
    // Should still produce output using the native values (empty for a fresh element)
    expect(result).toBe('div');
  });

  it('does not invoke user-defined getAttribute override ', () => {
    const el = document.createElement('input');
    el.setAttribute('type', 'text');
    el.setAttribute('name', 'email');

    let overrideInvoked = false;
    el.getAttribute = () => {
      overrideInvoked = true;
      return 'trap';
    };

    const result = htmlTreeAsString(el);

    expect(overrideInvoked).toBe(false);
    expect(result).toBe('input[type="text"][name="email"]');
  });

  it('does not invoke user-defined parentNode getter ', () => {
    const parent = document.createElement('div');
    parent.id = 'root';
    const child = document.createElement('span');
    parent.appendChild(child);

    let parentNodeGetterInvoked = false;
    Object.defineProperty(child, 'parentNode', {
      get() {
        parentNodeGetterInvoked = true;
        return null;
      },
    });

    const result = htmlTreeAsString(child);

    expect(parentNodeGetterInvoked).toBe(false);
    expect(result).toBe('div#root > span');
  });

  it('renders the nice tree format even with user-defined getters ', () => {
    const body = document.createElement('body');
    const div = document.createElement('div');
    div.id = 'app';
    const button = document.createElement('button');
    button.className = 'submit';
    button.setAttribute('type', 'button');
    body.appendChild(div);
    div.appendChild(button);

    Object.defineProperty(button, 'id', {
      get() {
        return 'trap';
      },
    });
    Object.defineProperty(button, 'className', {
      get() {
        return 'trap';
      },
    });

    const result = htmlTreeAsString(button);

    expect(result).toBe('body > div#app > button.submit[type="button"]');
  });

  it('returns <unknown> for falsy values', () => {
    expect(htmlTreeAsString(null)).toBe('<unknown>');
    expect(htmlTreeAsString(undefined)).toBe('<unknown>');
  });
});
