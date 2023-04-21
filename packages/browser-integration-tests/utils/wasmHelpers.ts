/**
 * We can only test WASM tests in certain bundles/packages:
 * - NPM (ESM, CJS)
 * - ES6 CDN bundles
 * - On browsers other than WebKit
 *
 * @returns `true` if we should skip the replay test
 */
export function shouldSkipWASMTests(browser: string, bundle: string): boolean {
  if (browser === 'webkit') {
    return true;
  }
  return bundle.includes('es5');
}
