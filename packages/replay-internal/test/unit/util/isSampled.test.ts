import { describe, expect, test, vi } from 'vitest';
import { isSampled } from '../../../src/util/isSampled';

// Note Math.random generates a value from 0 (inclusive) to <1 (1 exclusive).
const cases: [number, number, boolean][] = [
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

describe('Unit | util | isSampled', () => {
  const mockRandom = vi.spyOn(Math, 'random');

  test.each(cases)(
    'given sample rate of %j and RNG returns %j, result should be %j',
    (sampleRate: number, mockRandomValue: number, expectedResult: boolean) => {
      mockRandom.mockImplementationOnce(() => mockRandomValue);
      const result = isSampled(sampleRate);
      expect(result).toEqual(expectedResult);
    },
  );
});
