import { parseSampleRate } from '../../../src/utils/parseSampleRate';

describe('parseSampleRate', () => {
  it.each([
    [undefined, undefined],
    [null, undefined],
    [0, 0],
    [1, 1],
    [0.555, 0.555],
    [2, undefined],
    [false, 0],
    [true, 1],
    ['', undefined],
    ['aha', undefined],
    ['1', 1],
    ['1.5', undefined],
    ['0.555', 0.555],
    ['0', 0],
  ])('works with %p', (input, sampleRate) => {
    const actual = parseSampleRate(input);
    expect(actual).toBe(sampleRate);
  });
});
