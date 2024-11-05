/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';

import { getKeyboardBreadcrumb } from '../../../src/coreHandlers/handleKeyboardEvent';

describe('Unit | coreHandlers | handleKeyboardEvent', () => {
  describe('getKeyboardBreadcrumb', () => {
    it('returns null for event on input', function () {
      const event = makeKeyboardEvent({ tagName: 'input', key: 'Escape' });
      const actual = getKeyboardBreadcrumb(event);
      expect(actual).toBeNull();
    });

    it('returns null for event on textarea', function () {
      const event = makeKeyboardEvent({ tagName: 'textarea', key: 'Escape' });
      const actual = getKeyboardBreadcrumb(event);
      expect(actual).toBeNull();
    });

    it('returns null for event on contenteditable div', function () {
      // JSDOM does not support contentEditable properly :(
      const target = document.createElement('div');
      Object.defineProperty(target, 'isContentEditable', {
        get: function () {
          return true;
        },
      });

      const event = makeKeyboardEvent({ target, key: 'Escape' });
      const actual = getKeyboardBreadcrumb(event);
      expect(actual).toBeNull();
    });

    it('returns breadcrumb for Escape event on body', function () {
      const event = makeKeyboardEvent({ tagName: 'body', key: 'Escape' });
      const actual = getKeyboardBreadcrumb(event);
      expect(actual).toEqual({
        category: 'ui.keyDown',
        data: {
          altKey: false,
          ctrlKey: false,
          key: 'Escape',
          metaKey: false,
          shiftKey: false,
        },
        message: 'body',
        timestamp: expect.any(Number),
        type: 'default',
      });
    });

    it.each(['a', '1', '!', '~', ']'])('returns null for %s key on body', key => {
      const event = makeKeyboardEvent({ tagName: 'body', key });
      const actual = getKeyboardBreadcrumb(event);
      expect(actual).toEqual(null);
    });

    it.each(['a', '1', '!', '~', ']'])('returns null for %s key + Shift on body', key => {
      const event = makeKeyboardEvent({ tagName: 'body', key, shiftKey: true });
      const actual = getKeyboardBreadcrumb(event);
      expect(actual).toEqual(null);
    });

    it.each(['a', '1', '!', '~', ']'])('returns breadcrumb for %s key + Ctrl on body', key => {
      const event = makeKeyboardEvent({ tagName: 'body', key, ctrlKey: true });
      const actual = getKeyboardBreadcrumb(event);
      expect(actual).toEqual({
        category: 'ui.keyDown',
        data: {
          altKey: false,
          ctrlKey: true,
          key,
          metaKey: false,
          shiftKey: false,
        },
        message: 'body',
        timestamp: expect.any(Number),
        type: 'default',
      });
    });
  });
});

function makeKeyboardEvent({
  metaKey = false,
  shiftKey = false,
  ctrlKey = false,
  altKey = false,
  key,
  tagName,
  target,
}: {
  metaKey?: boolean;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  key: string;
  tagName?: string;
  target?: HTMLElement;
}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { metaKey, shiftKey, ctrlKey, altKey, key });

  const element = target || document.createElement(tagName || 'div');
  element.dispatchEvent(event);

  return event;
}
