const UNSAFE_CHARS = /[<>\u2028\u2029]/g;

const ESCAPED_CHARS: Record<string, string> = {
  '<': '\\u003c',
  '>': '\\u003e',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

/**
 * A drop-in replacement for `JSON.stringify`, for values that go into generated JavaScript code.
 *
 * `JSON.stringify` output is a valid JavaScript expression, but it does not escape `<` and `>`, so
 * a value with `</script>` or `<!--` breaks out of a `<script>` element when the code is inlined in
 * HTML. It also does not escape U+2028 and U+2029, which end a line in JavaScript before ES2019.
 * These characters only occur inside JSON strings, where their `\u` escapes have the same value.
 *
 * Use this every time `JSON.stringify` output is put into code, for example in a bundler plugin.
 *
 * @internal Only meant for Sentry-internal SDK usage.
 * @hidden
 */
export function stringifyForCodeInjection(
  value: unknown,
  // oxlint-disable-next-line typescript/no-explicit-any
  replacer?: ((this: any, key: string, value: any) => any) | (number | string)[] | null,
  space?: string | number,
): string {
  // `JSON.stringify` returns `undefined` for `undefined` and functions, although its type says `string`.
  // oxlint-disable-next-line typescript/no-explicit-any
  return JSON.stringify(value, replacer as any, space)?.replace(UNSAFE_CHARS, char => ESCAPED_CHARS[char] as string);
}
