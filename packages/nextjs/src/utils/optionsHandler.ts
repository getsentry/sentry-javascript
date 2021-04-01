declare global {
  interface Window {
    __SENTRY__: {
      // Where tmp options are
      // Options for Next.js SDK are defined before the SDK can be initialized,
      // so they are stored in a tmp global variable, where the SDK can take them.
      _tmp: {
        nextjs: {
          _options: {
            browser: any;
          };
        };
      };
    };
  }
}

/**
 * Creates the required objects to store tmp data.
 */
function createTmpOptions(): void {
  window.__SENTRY__._tmp = {
    nextjs: {
      _options: {
        browser: {},
      },
    },
  };
}
createTmpOptions();

const SDK_TMP_OPTIONS = window.__SENTRY__._tmp.nextjs._options;
SDK_TMP_OPTIONS.browser = {};

/**
 * Adds the given options to the browser options.
 * Note that options are added (appended), not set (overwritten).
 */
export function addBrowserOptions(browserOptions: any): void {
  SDK_TMP_OPTIONS.browser = { ...SDK_TMP_OPTIONS.browser, ...browserOptions };
}

export function removeBrowserOptions(): void {
  SDK_TMP_OPTIONS.browser = {};
}

export function areAddedBrowserOptions(): boolean {
  return Object.keys(SDK_TMP_OPTIONS.browser).length > 0;
}

export function getBrowserOptions(): any {
  return SDK_TMP_OPTIONS.browser;
}
