/**
 * @vitest-environment jsdom
 */

import type { HandlerDataDom } from '@sentry/core';
import { record } from '@sentry-internal/rrweb';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { handleDom } from '../../../src/coreHandlers/handleDom';

describe('Unit | coreHandlers | handleDom', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('it works with a basic click event on a div', () => {
    const parent = document.createElement('body');
    const target = document.createElement('div');
    target.classList.add('my-class', 'other-class');
    parent.appendChild(target);

    const handlerData: HandlerDataDom = {
      name: 'click',
      event: {
        target,
      },
    };
    const actual = handleDom(handlerData);
    expect(actual).toEqual({
      category: 'ui.click',
      data: {},
      message: 'body > div.my-class.other-class',
      timestamp: expect.any(Number),
      type: 'default',
    });
  });

  test('it works with a basic click event on a button', () => {
    const parent = document.createElement('body');
    const target = document.createElement('button');
    target.classList.add('my-class', 'other-class');
    parent.appendChild(target);

    const handlerData: HandlerDataDom = {
      name: 'click',
      event: {
        target,
      },
    };
    const actual = handleDom(handlerData);
    expect(actual).toEqual({
      category: 'ui.click',
      data: {},
      message: 'body > button.my-class.other-class',
      timestamp: expect.any(Number),
      type: 'default',
    });
  });

  test('it works with a basic click event on a span inside of <button>', () => {
    const parent = document.createElement('body');
    const interactive = document.createElement('button');
    interactive.classList.add('my-class', 'other-class');
    parent.appendChild(interactive);

    const target = document.createElement('span');
    interactive.appendChild(target);

    const handlerData: HandlerDataDom = {
      name: 'click',
      event: {
        target,
      },
    };
    const actual = handleDom(handlerData);
    expect(actual).toEqual({
      category: 'ui.click',
      data: {},
      message: 'body > button.my-class.other-class',
      timestamp: expect.any(Number),
      type: 'default',
    });
  });

  test('it works with a basic click event on a span inside of <a>', () => {
    const parent = document.createElement('body');
    const interactive = document.createElement('a');
    interactive.classList.add('my-class', 'other-class');
    parent.appendChild(interactive);

    const target = document.createElement('span');
    interactive.appendChild(target);

    const handlerData: HandlerDataDom = {
      name: 'click',
      event: {
        target,
      },
    };
    const actual = handleDom(handlerData);
    expect(actual).toEqual({
      category: 'ui.click',
      data: {},
      message: 'body > a.my-class.other-class',
      timestamp: expect.any(Number),
      type: 'default',
    });
  });

  test('it works with very deep nesting', () => {
    const parent = document.createElement('body');

    let current: HTMLElement = parent;
    for (let i = 0; i < 20; i++) {
      const next = document.createElement('div');
      next.classList.add(`level-${i}`, `level-other-${i}`);
      current.appendChild(next);
      current = next;
    }

    const target = document.createElement('div');
    target.classList.add('my-class', 'other-class');
    current.appendChild(target);

    const handlerData: HandlerDataDom = {
      name: 'click',
      event: {
        target,
      },
    };
    const actual = handleDom(handlerData);
    expect(actual).toEqual({
      category: 'ui.click',
      data: {},
      message:
        'div.level-16.level-other-16 > div.level-17.level-other-17 > div.level-18.level-other-18 > div.level-19.level-other-19 > div.my-class.other-class',
      timestamp: expect.any(Number),
      type: 'default',
    });
  });

  test('prefers live element attributes over stale rrweb mirror metadata', () => {
    const target = document.createElement('button');
    target.setAttribute('id', 'save-note-button');
    target.setAttribute('data-testid', 'save-note-button');
    target.textContent = 'Save Note';

    vi.spyOn(record.mirror, 'getId').mockReturnValue(42);
    vi.spyOn(record.mirror, 'getNode').mockReturnValue(target);
    vi.spyOn(record.mirror, 'getMeta').mockReturnValue({
      id: 42,
      type: 2,
      tagName: 'button',
      childNodes: [{ id: 43, type: 3, textContent: 'Save Note' }],
      attributes: {
        id: 'next-question-button',
        'data-testid': 'next-question-button',
      },
    });

    const actual = handleDom({
      name: 'click',
      event: { target },
    });

    expect(actual).toEqual({
      category: 'ui.click',
      data: {
        nodeId: 42,
        node: {
          id: 42,
          tagName: 'button',
          textContent: 'Save Note',
          attributes: {
            id: 'save-note-button',
            testId: 'save-note-button',
          },
        },
      },
      message: 'button#save-note-button',
      timestamp: expect.any(Number),
      type: 'default',
    });
  });
});
