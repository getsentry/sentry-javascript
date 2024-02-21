import { instrumentXHR } from '../../src/instrument/xhr';

jest.mock('../../src/worldwide', () => {
  const original = jest.requireActual('../../src/worldwide');

  return {
    ...original,
    GLOBAL_OBJ: {
      XMLHttpRequest: undefined,
    },
  };
});

describe('instrumentXHR', () => {
  it('it does not throw if XMLHttpRequest is a key on window but not defined', () => {
    expect(instrumentXHR).not.toThrow();
  });
});
