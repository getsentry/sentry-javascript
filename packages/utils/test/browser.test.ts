import { JSDOM } from 'jsdom';

import { htmlTreeAsString } from '../src/browser';

beforeAll(() => {
  const dom = new JSDOM();
  // @ts-ignore need to override global document
  global.document = dom.window.document;
});

describe('htmlTreeAsString', () => {
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

    expect(htmlTreeAsString(document.getElementById('cat-2'), ['test-id'])).toBe(
      'body > ul > li.li-class[title="li-title"] > img[test-id="cat-2-test-id"]',
    );
  });
});
