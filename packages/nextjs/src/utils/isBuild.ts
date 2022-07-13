/**
 * Decide if the currently running process is part of the build phase or happening at runtime.
 */
export function isBuild(): boolean {
  // During build, the main process is invoked by
  //   `node next build`
  // and child processes are invoked as
  //   `node <path>/node_modules/.../jest-worker/processChild.js`.
  // The former is (obviously) easy to recognize, but the latter could happen at runtime as well. Fortunately, the main
  // process hits this file before any of the child processes do, so we're able to set an env variable which the child
  // processes can then check. During runtime, the main process is invoked as
  //   `node next start`
  // or
  //   `node /var/runtime/index.js`,
  // so we never drop into the `if` in the first place.
  if (process.argv.includes('build') || process.env.SENTRY_BUILD_PHASE) {
    process.env.SENTRY_BUILD_PHASE = 'true';
    return true;
  }

  return false;
}
