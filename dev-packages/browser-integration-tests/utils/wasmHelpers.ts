/**
 * We can only test WASM tests in certain bundles/packages:
 * - NPM (ESM, CJS)
 * - CDN bundles
 * - On browsers other than WebKit
 *
 * @returns `true` if we should skip the replay test
 */
export function shouldSkipWASMTests(browser: string): boolean {
  if (browser === 'webkit') {
    return true;
  }
  const bundle = process.env.PW_BUNDLE as string | undefined;
  return bundle != null;
}
