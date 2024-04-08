import { getAttributesToRecord } from '../../../../src/coreHandlers/util/getAttributesToRecord';

it('records only included attributes', function () {
  expect(
    getAttributesToRecord({
      id: 'foo',
      class: 'btn btn-primary',
    }),
  ).toEqual({
    id: 'foo',
    class: 'btn btn-primary',
  });

  expect(
    getAttributesToRecord({
      id: 'foo',
      class: 'btn btn-primary',
      tabIndex: 2,
      ariaDescribedBy: 'tooltip-1',
    }),
  ).toEqual({
    id: 'foo',
    class: 'btn btn-primary',
  });

  expect(
    getAttributesToRecord({
      tabIndex: 2,
      ariaDescribedBy: 'tooltip-1',
    }),
  ).toEqual({});
});

it('records data-sentry-element as data-sentry-component when appropriate', function () {
  expect(
    getAttributesToRecord({
      ['data-sentry-component']: 'component',
      ['data-sentry-element']: 'element',
    }),
  ).toEqual({
    ['data-sentry-component']: 'component',
  });
  expect(
    getAttributesToRecord({
      ['data-sentry-element']: 'element',
    }),
  ).toEqual({
    ['data-sentry-component']: 'element',
  });
});
