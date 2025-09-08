import { consoleSandbox } from '@sentry/core';

/** Detect CommonJS. */
export function isCjs(): boolean {
  try {
    return typeof module !== 'undefined' && typeof module.exports !== 'undefined';
  } catch {
    return false;
  }
}

let hasWarnedAboutNodeVersion: boolean | undefined;

/**
 * Check if the current Node.js version supports module.register
 */
export function supportsEsmLoaderHooks(): boolean {
  if (isCjs()) {
    return false;
  }

  const [nodeMajor = 0, nodeMinor = 0] = process.versions.node.split('.').map(Number);
  if (nodeMajor >= 21 || (nodeMajor === 20 && nodeMinor >= 6) || (nodeMajor === 18 && nodeMinor >= 19)) {
    return true;
  }

  if (!hasWarnedAboutNodeVersion) {
    hasWarnedAboutNodeVersion = true;

    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.warn(
        `[Sentry] You are using Node.js v${process.versions.node} in ESM mode ("import syntax"). The Sentry Node.js SDK is not compatible with ESM in Node.js versions before 18.19.0 or before 20.6.0. Please either build your application with CommonJS ("require() syntax"), or upgrade your Node.js version.`,
      );
    });
  }

  return false;
}
