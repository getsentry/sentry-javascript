/**
 * We can only test WASM tests in certain bundles/packages:
 * - NPM (ESM, CJS)
 * - ES6 CDN bundles
 *
 * @returns `true` if we should skip the replay test
 */
export function shouldSkipWASMTests(): boolean {
  const bundle = process.env.PW_BUNDLE as string | undefined;
  return bundle != null && bundle.includes('es5');
}
