import { JSDOM } from 'jsdom';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { htmlTreeAsString } from '../../../src/utils/browser';

beforeAll(() => {
  const dom = new JSDOM();
  global.document = dom.window.document;
  global.HTMLElement = dom.window.HTMLElement;
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

  describe('data-sentry-label support', () => {
    it('returns data-sentry-label when element has the attribute directly', () => {
      const el = document.createElement('div');
      el.innerHTML = '<button data-sentry-label="SubmitButton" class="btn" />';
      document.body.appendChild(el);

      expect(htmlTreeAsString(document.querySelector('button'))).toBe(
        'body > div > [data-sentry-label="SubmitButton"]',
      );
    });

    it('includes data-sentry-label from ancestor element in the path', () => {
      const el = document.createElement('div');
      el.innerHTML = `<div data-sentry-label="LoginForm">
        <div class="form-group">
          <button id="submit-btn" class="btn" />
        </div>
      </div>`;
      document.body.appendChild(el);

      expect(htmlTreeAsString(document.getElementById('submit-btn'))).toBe(
        'div > [data-sentry-label="LoginForm"] > div.form-group > button#submit-btn.btn',
      );
    });

    it('finds data-sentry-label on a distant ancestor within traverse limit', () => {
      const el = document.createElement('div');
      el.innerHTML = `<div data-sentry-label="DeepForm">
        <div class="level-1">
          <div class="level-2">
            <div class="level-3">
              <div class="level-4">
                <div class="level-5">
                  <button id="deep-btn" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>`;
      document.body.appendChild(el);

      const result = htmlTreeAsString(document.getElementById('deep-btn'));
      expect(result).toContain('[data-sentry-label="DeepForm"]');
    });

    it('does not add prefix if data-sentry-label is already in cssSelector path', () => {
      const el = document.createElement('div');
      el.innerHTML = `<div data-sentry-label="OuterLabel">
        <div data-sentry-label="InnerLabel">
          <button id="btn" />
        </div>
      </div>`;
      document.body.appendChild(el);

      expect(htmlTreeAsString(document.getElementById('btn'))).toBe('[data-sentry-label="InnerLabel"] > button#btn');
    });

    it('returns normal cssSelector when no data-sentry-label exists', () => {
      const el = document.createElement('div');
      el.innerHTML = `<div class="container">
        <button id="no-label-btn" class="btn" />
      </div>`;
      document.body.appendChild(el);

      expect(htmlTreeAsString(document.getElementById('no-label-btn'))).toBe(
        'body > div > div.container > button#no-label-btn.btn',
      );
    });

    it('prioritizes data-sentry-label over data-sentry-component', () => {
      const el = document.createElement('div');
      el.innerHTML = '<button data-sentry-component="MyComponent" data-sentry-label="MyLabel" class="btn" />';
      document.body.appendChild(el);

      expect(htmlTreeAsString(document.querySelector('button'))).toBe('body > div > [data-sentry-label="MyLabel"]');
    });
  });
});
