// This would be exposed in the global environment whenever `zone.js` is
// included in the `polyfills` configuration property. Starting from Angular 17,
// users can opt-in to use zoneless change detection.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Zone: any;

// In Angular 17 and future versions, zoneless support is forthcoming.
// Therefore, it's advisable to safely check whether the `run` function is
// available in the `<root>` context.
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
const isNgZoneEnabled = typeof Zone !== 'undefined' && Zone.root?.run;

/**
 * The function that does the same job as `NgZone.runOutsideAngular`.
 *
 * ⚠️ Note: All of the Sentry functionality called from inside the Angular
 * execution context must be wrapped in this function. Angular's rendering
 * relies on asynchronous tasks being scheduled within its execution context.
 * Since Sentry schedules tasks that do not interact with Angular's rendering,
 * it may prevent Angular from functioning reliably. Consequently, it may disrupt
 * processes such as server-side rendering or client-side hydration.
 */
export function runOutsideAngular<T>(callback: () => T): T {
  // Running the `callback` within the root execution context enables Angular
  // processes (such as SSR and hydration) to continue functioning normally without
  // timeouts and delays that could affect the user experience. This approach is
  // necessary because some of the Sentry functionality continues to run in the background.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  return isNgZoneEnabled ? Zone.root.run(callback) : callback();
}
