import { assertNotEquals } from 'https://deno.land/std@0.202.0/assert/assert_not_equals.ts';
import { init } from '../build/index.mjs';

Deno.test('init() should return client', () => {
  assertNotEquals(init({}), undefined);
});
