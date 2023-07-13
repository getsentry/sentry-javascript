import type { Sampled } from '../../../src/types';
import { sampleSession } from '../../../src/util/sampleSession';

// Note: We "fix" Math.random() to always return 0.2
const cases: [number, number, Sampled][] = [
  [0, 0, false],
  [-1, -1, false],
  [1, 0, 'session'],
  [0, 1, 'buffer'],
  [0.1, 0.1, 'buffer'],
  [0.1, 0, false],
  [0.3, 0.1, 'session'],
  [0.3, 0, 'session'],
];

describe('Unit | util | sampleSession', () => {
  const mockRandom = jest.spyOn(Math, 'random');

  test.each(cases)(
    'given sessionSampleRate=%p and errorSampleRate=%p, result should be %p',
    (sessionSampleRate: number, errorSampleRate: number, expectedResult: Sampled) => {
      mockRandom.mockImplementationOnce(() => 0.2);

      const result = sampleSession({ sessionSampleRate, errorSampleRate });
      expect(result).toEqual(expectedResult);
    },
  );
});
