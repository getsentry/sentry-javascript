import { ignoreElement } from '../../../src/coreHandlers/handleSlowClick';
import type { SlowClickConfig } from '../../../src/types';

describe('Unit | coreHandlers | handleSlowClick', () => {
  describe('ignoreElement', () => {
    it.each([
      ['div', {}, true],
      ['button', {}, false],
      ['a', {}, false],
      ['input', {}, true],
      ['input', { type: 'text' }, true],
      ['input', { type: 'button' }, false],
      ['input', { type: 'submit' }, false],
      ['a', { target: '_self' }, false],
      ['a', { target: '_blank' }, true],
      ['a', { download: '' }, true],
      ['a', { href: 'xx' }, false],
    ])('it works with <%s> & %p', (tagName, attributes, expected) => {
      const node = document.createElement(tagName);
      Object.entries(attributes).forEach(([key, value]) => {
        node.setAttribute(key, value);
      });
      expect(ignoreElement(node, {} as SlowClickConfig)).toBe(expected);
    });

    test('it ignored selectors matching ignoreSelector', () => {
      const button = document.createElement('button');
      const a = document.createElement('a');

      expect(ignoreElement(button, { ignoreSelector: 'button' } as SlowClickConfig)).toBe(true);
      expect(ignoreElement(a, { ignoreSelector: 'button' } as SlowClickConfig)).toBe(false);
    });
  });
});
