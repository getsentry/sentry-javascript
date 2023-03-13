import { getAttributesToRecord } from '../../../../src/coreHandlers/util/getAttributesToRecord';

it('records only included attributes', function () {
  expect(
    getAttributesToRecord({
      id: 'foo',
      classList: ['btn', 'btn-primary'],
    }),
  ).toEqual({
    id: 'foo',
    classList: ['btn', 'btn-primary'],
  });

  expect(
    getAttributesToRecord({
      id: 'foo',
      classList: ['btn', 'btn-primary'],
      tabIndex: 2,
      ariaDescribedBy: 'tooltip-1',
    }),
  ).toEqual({
    id: 'foo',
    classList: ['btn', 'btn-primary'],
  });

  expect(
    getAttributesToRecord({
      tabIndex: 2,
      ariaDescribedBy: 'tooltip-1',
    }),
  ).toEqual({});
});
