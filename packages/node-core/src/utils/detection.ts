import * as moduleModule from 'node:module';
import { consoleSandbox } from '@sentry/core';

/** Detect CommonJS. */
export function isCjs(): boolean {
  try {
    return typeof module !== 'undefined' && typeof module.exports !== 'undefined';
  } catch {
    return false;
  }
}

/**
 * Check if the current Node.js version supports module.register
 */
export function supportsEsmLoaderHooks(): boolean {
  logIfUnsupportedNodeVersion();

  return 'register' in moduleModule;
}

let hasWarnedAboutNodeVersion: boolean | undefined;

/**
 * Log a warning if the current Node.js version is not supported in ESM mode
 */
function logIfUnsupportedNodeVersion(): void {
  if (hasWarnedAboutNodeVersion) {
    return;
  }

  if (isCjs()) {
    return;
  }

  const [nodeMajor = 0, nodeMinor = 0] = process.versions.node.split('.').map(Number);
  if (nodeMajor >= 21 || (nodeMajor === 20 && nodeMinor >= 6) || (nodeMajor === 18 && nodeMinor >= 19)) {
    return;
  }

  hasWarnedAboutNodeVersion = true;

  consoleSandbox(() => {
    // eslint-disable-next-line no-console
    console.warn(
      `[Sentry] You are using Node.js v${process.versions.node} in ESM mode ("import syntax"). The Sentry Node.js SDK is not compatible with ESM in Node.js versions before 18.19.0 or before 20.6.0. Please either build your application with CommonJS ("require() syntax"), or upgrade your Node.js version.`,
    );
  });
}
