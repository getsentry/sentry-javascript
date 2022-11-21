import { isSampled } from '../../../src/util/isSampled';

// Note Math.random generates a value from 0 (inclusive) to <1 (1 exclusive).
const cases = [
  [1.0, 0.9999, true],
  [1.0, 0.0, true],
  [1.0, 0.5, true],
  [0.0, 0.9999, false],
  [0.0, 0.0, false],
  [0.0, 0.5, false],
  [0.5, 0.9999, false],
  [0.5, 0.5, false],
  [0.5, 0.0, true],
];

jest.spyOn(Math, 'random');
const mockRandom = Math.random as jest.MockedFunction<typeof Math.random>;

describe('isSampled', () => {
  test.each(cases)(
    'given sample rate of %p and RNG returns %p, result should be %p',
    (sampleRate: number, mockRandomValue: number, expectedResult: boolean) => {
      mockRandom.mockImplementationOnce(() => mockRandomValue);
      const result = isSampled(sampleRate);
      expect(result).toEqual(expectedResult);
    },
  );
});
