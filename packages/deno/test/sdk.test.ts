import { init } from '../build/index.mjs';
import { assertNotEquals } from "https://deno.land/std@0.202.0/assert/assert_not_equals.ts";

Deno.test('init() should return client', () => {
    assertNotEquals(init({}), undefined);
});
