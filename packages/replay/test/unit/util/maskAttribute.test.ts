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
      'does not mask if `maskAllText` is false, despite `maskTextSelector` ',
      { ...defaultArgs, maskAllText: false, maskTextSelector: 'classy' },
      'foo',
    ],
    ['does not mask if `maskAllText` is false', { ...defaultArgs, maskAllText: false }, 'foo'],
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
  ])('%s', (_: string, input, output) => {
    expect(maskAttribute(input)).toEqual(output);
  });
});
