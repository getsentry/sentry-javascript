import { isAtLeastReact17 } from '../src/error';

describe('isAtLeastReact17', () => {
  test.each([
    ['React 16', '16.0.4', false],
    ['React 17', '17.0.0', true],
    ['React 17 with no patch', '17.4', true],
    ['React 17 with no patch and no minor', '17', true],
    ['React 18', '18.1.0', true],
    ['React 19', '19.0.0', true],
  ])('%s', (_: string, input: string, output: ReturnType<typeof isAtLeastReact17>) => {
    expect(isAtLeastReact17(input)).toBe(output);
  });
});
