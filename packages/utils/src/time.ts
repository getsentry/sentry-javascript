import { getGlobalObject } from './misc';
import { dynamicRequire, isNodeEnv } from './node';

const INITIAL_TIME = Date.now();

/**
 * Cross platform compatible partial performance implementation
 */
interface CrossPlatformPerformance {
  timeOrigin: number;
  /**
   * Returns the current timestamp in ms
   */
  now(): number;
}

let prevNow = 0;

const performanceFallback: CrossPlatformPerformance = {
  now(): number {
    let now = Date.now() - INITIAL_TIME;
    if (now < prevNow) {
      now = prevNow;
    }
    prevNow = now;
    return now;
  },
  timeOrigin: INITIAL_TIME,
};

const crossPlatformPerformance: CrossPlatformPerformance = ((): CrossPlatformPerformance => {
  // React Native's performance.now() starts with a gigantic offset, so we need to wrap it.
  if (isReactNative()) {
    return getReactNativePerformanceWrapper();
  }

  if (isNodeEnv()) {
    try {
      const perfHooks = dynamicRequire(module, 'perf_hooks') as { performance: CrossPlatformPerformance };
      return perfHooks.performance;
    } catch (_) {
      return performanceFallback;
    }
  }

  const { performance } = getGlobalObject<Window>();

  if (!performance || !performance.now) {
    return performanceFallback;
  }

  // Polyfill for performance.timeOrigin.
  //
  // While performance.timing.navigationStart is deprecated in favor of performance.timeOrigin, performance.timeOrigin
  // is not as widely supported. Namely, performance.timeOrigin is undefined in Safari as of writing.
  if (performance.timeOrigin === undefined) {
    // As of writing, performance.timing is not available in Web Workers in mainstream browsers, so it is not always a
    // valid fallback. In the absence of a initial time provided by the browser, fallback to INITIAL_TIME.
    // @ts-ignore ignored because timeOrigin is a readonly property but we want to override
    // eslint-disable-next-line deprecation/deprecation
    performance.timeOrigin = (performance.timing && performance.timing.navigationStart) || INITIAL_TIME;
  }

  return performance;
})();

/**
 * Returns a timestamp in seconds with milliseconds precision since the UNIX epoch calculated with the monotonic clock.
 */
export function timestampWithMs(): number {
  return (crossPlatformPerformance.timeOrigin + crossPlatformPerformance.now()) / 1000;
}

/**
 * Determines if running in react native
 */
function isReactNative(): boolean {
  return getGlobalObject<Window>().navigator?.product === 'ReactNative';
}

/**
 * Performance wrapper for react native as performance.now() has been found to start off with an unusual offset.
 */
function getReactNativePerformanceWrapper(): CrossPlatformPerformance {
  // Performance only available >= RN 0.63
  const { performance } = getGlobalObject<Window>();
  if (performance && typeof performance.now === 'function') {
    const INITIAL_OFFSET = performance.now();

    return {
      now(): number {
        return performance.now() - INITIAL_OFFSET;
      },
      timeOrigin: INITIAL_TIME,
    };
  }
  return performanceFallback;
}
