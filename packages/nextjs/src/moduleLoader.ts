import { dynamicRequire } from '@sentry/utils';

/**
 * Dynamically require the correct NextJS module, and return it.
 *
 * The correct module depends on the environment the app is running in;
 * either browser, or node.
 */
export function dynamicRequireNextjsModule(): any {
  if (isRunningInNode()) {
    // return dynamicRequire(module, './module');
    return dynamicRequire(module, './browser'); // TODO: this should be removed
  } else {
    return dynamicRequire(module, './browser');
  }
}

/** Returns whether this is being run in Node. */
function isRunningInNode(): boolean {
  return typeof process !== 'undefined' && process.versions != null && process.versions.node != null;
}
