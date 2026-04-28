/**
 * @vitest-environment jsdom
 */

import { describe, expect, test } from 'vitest';
import { maskAttribute } from '../../../src/util/maskAttribute';

describe('maskAttribute', () => {
  const defaultEl = document.createElement('div');
  defaultEl.className = 'classy';
  const privacyOptions = {
    maskTextSelector: '',
    unmaskTextSelector: '.unmask',
    blockSelector: '',
    unblockSelector: '',
    ignoreSelector: '',
  };
  const defaultArgs = {
    el: defaultEl,
    key: 'title',
    maskAttributes: ['title'],
    maskAllText: true,
    privacyOptions,
    value: 'foo',
  };

  const inputSubmit = document.createElement('input');
  const inputButton = document.createElement('input');
  [inputSubmit, inputButton].forEach(el => {
    el.type = 'submit';
  });

  test.each([
    ['masks if `maskAllText` is true', defaultArgs, '***'],
    [
      'masks when key is in `maskAttributes` even if `maskAllText` is false',
      { ...defaultArgs, maskAllText: false },
      '***',
    ],
    [
      'does not mask when key is not in `maskAttributes` and `maskAllText` is false',
      { ...defaultArgs, maskAllText: false, key: 'id', maskAttributes: ['title'] },
      'foo',
    ],
    [
      'does not mask if `unmaskTextSelector` matches',
      { ...defaultArgs, privacyOptions: { ...privacyOptions, unmaskTextSelector: '.classy' } },
      'foo',
    ],
    [
      'masks `value` attribute on `<input>` with type "submit"',
      { ...defaultArgs, el: inputSubmit, value: 'input value' },
      '***** *****',
    ],
    [
      'masks `value` attribute on `<input>` with type "button"',
      { ...defaultArgs, el: inputButton, value: 'input value' },
      '***** *****',
    ],
    [
      'does not mask submit `value` when `maskAllText` is false unless `value` is in `maskAttributes`',
      {
        ...defaultArgs,
        el: inputSubmit,
        key: 'value',
        maskAttributes: ['title'],
        maskAllText: false,
        value: 'input value',
      },
      'input value',
    ],
    [
      'masks submit `value` when `maskAllText` is false if `value` is in `maskAttributes`',
      {
        ...defaultArgs,
        el: inputSubmit,
        key: 'value',
        maskAttributes: ['value'],
        maskAllText: false,
        value: 'input value',
      },
      '***** *****',
    ],
  ])('%s', (_: string, input, output) => {
    expect(maskAttribute(input)).toEqual(output);
  });
});
