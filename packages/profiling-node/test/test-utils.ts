import type { TestFunction } from 'vitest';
import { it } from 'vitest';

export function constructItWithTimeout(timeout: number) {
  // eslint-disable-next-line @typescript-eslint/ban-types
  return function itWithTimeout<ExtraContext extends {}>(name: string | Function, fn?: TestFunction<ExtraContext>) {
    return it(name, fn, timeout);
  };
}
