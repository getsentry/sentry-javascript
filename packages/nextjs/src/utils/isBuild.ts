import { NEXT_PHASE_PRODUCTION_BUILD } from './phases';

/**
 * Decide if the currently running process is part of the build phase or happening at runtime.
 */
export function isBuild(): boolean {
  if (
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
    process.argv.includes('build') ||
    process.env.SENTRY_BUILD_PHASE ||
    // This is set by next, but not until partway through the build process, which is why we need the above checks. That
    // said, in case this function isn't called until we're in a child process, it can serve as a good backup.
    process.env.NEXT_PHASE === NEXT_PHASE_PRODUCTION_BUILD
  ) {
    process.env.SENTRY_BUILD_PHASE = 'true';
    return true;
  }

  return false;
}
