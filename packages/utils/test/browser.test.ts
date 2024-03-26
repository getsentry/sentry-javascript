import { JSDOM } from 'jsdom';

import { getDomElement, htmlTreeAsString } from '../src/browser';

beforeAll(() => {
  const dom = new JSDOM();
  global.document = dom.window.document;
  global.HTMLElement = new JSDOM().window.HTMLElement;
});

describe('htmlTreeAsString', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('generates html tree for a simple element', () => {
    const el = document.createElement('ul');
    el.innerHTML = `<li class="container">
      <button id="err-btn" class="button" />
    </li>`;
    document.body.appendChild(el);

    expect(htmlTreeAsString(document.getElementById('err-btn'))).toBe(
      'body > ul > li.container > button#err-btn.button',
    );
  });

  it('generates unknown for an empty element', () => {
    expect(htmlTreeAsString(undefined)).toBe('<unknown>');
  });

  it('inserts pre-defined attribute values by default', () => {
    const el = document.createElement('ul');
    el.innerHTML = `<li title="container-title" class="container">
      <img id="cat" test-id="cat-test-id" alt="kitten" />
    </li>`;
    document.body.appendChild(el);

    expect(htmlTreeAsString(document.getElementById('cat'))).toBe(
      'body > ul > li.container[title="container-title"] > img#cat[alt="kitten"]',
    );
  });

  it('insert key attribute instead of class names or ids when serializeAttribute is defined and the element has it', () => {
    const el = document.createElement('ul');
    el.innerHTML = `<li class="li-class" title="li-title">
      <img id="cat-2" class="catimg" test-id="cat-2-test-id"/>
    </li>`;
    document.body.appendChild(el);

    // Two formats for specifying keyAttrs
    expect(htmlTreeAsString(document.getElementById('cat-2'), ['test-id'])).toBe(
      'body > ul > li.li-class[title="li-title"] > img[test-id="cat-2-test-id"]',
    );
    expect(htmlTreeAsString(document.getElementById('cat-2'), { keyAttrs: ['test-id'] })).toBe(
      'body > ul > li.li-class[title="li-title"] > img[test-id="cat-2-test-id"]',
    );
  });

  it('caps string output according to provided maxStringLength', () => {
    const el = document.createElement('div');
    el.innerHTML = `<div id="main-cta">
      <div class="container">
        <button class="bg-blue-500 hover:bg-blue-700 text-white hover:text-blue-100" />
      </div>
    </div>`;
    document.body.appendChild(el);

    expect(htmlTreeAsString(document.querySelector('button'))).toBe(
      'button.bg-blue-500.hover:bg-blue-700.text-white.hover:text-blue-100',
    );
    expect(htmlTreeAsString(document.querySelector('button'), { maxStringLength: 100 })).toBe(
      'div#main-cta > div.container > button.bg-blue-500.hover:bg-blue-700.text-white.hover:text-blue-100',
    );
  });
});

describe('getDomElement', () => {
  it('returns the element for a given query selector', () => {
    document.head.innerHTML = '<div id="mydiv">Hello</div>';
    const el = getDomElement('div#mydiv');
    expect(el).toBeDefined();
    expect(el?.tagName).toEqual('DIV');
    expect(el?.id).toEqual('mydiv');
  });
});
