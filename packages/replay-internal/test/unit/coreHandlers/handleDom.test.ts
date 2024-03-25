import type { HandlerDataDom } from '@sentry/types';

import { handleDom } from '../../../src/coreHandlers/handleDom';

describe('Unit | coreHandlers | handleDom', () => {
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
});
