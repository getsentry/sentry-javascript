import { convertOtelTimeToSeconds } from '../../src/utils/convertOtelTimeToSeconds';

describe('convertOtelTimeToSeconds', () => {
  it('works', () => {
    expect(convertOtelTimeToSeconds([0, 0])).toEqual(0);
    expect(convertOtelTimeToSeconds([1000, 50])).toEqual(1000.00000005);
    expect(convertOtelTimeToSeconds([1000, 505])).toEqual(1000.000000505);
  });
});
