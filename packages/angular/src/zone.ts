// That's the `global.Zone` exposed when the `zone.js` package is used.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Zone: any;

// There're 2 types of Angular applications:
// 1) zone-full (by default)
// 2) zone-less
// The developer can avoid importing the `zone.js` package and tells Angular that
// he is responsible for running the change detection by himself. This is done by
// "nooping" the zone through `CompilerOptions` when bootstrapping the root module.
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
const isNgZoneEnabled = typeof Zone !== 'undefined' && !!Zone.current;

/**
 * The function that does the same job as `NgZone.runOutsideAngular`.
 */
export function runOutsideAngular<T>(callback: () => T): T {
  // The `Zone.root.run` basically will run the `callback` in the most parent zone.
  // Any asynchronous API used inside the `callback` won't catch Angular's zone
  // since `Zone.current` will reference `Zone.root`.
  // The Angular's zone is forked from the `Zone.root`. In this case, `zone.js` won't
  // trigger change detection, and `ApplicationRef.tick()` will not be run.
  // Caretaker note: we're using `Zone.root` except `NgZone.runOutsideAngular` since this
  // will require injecting the `NgZone` facade. That will create a breaking change for
  // projects already using the `@sentry/angular`.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  return isNgZoneEnabled ? Zone.root.run(callback) : callback();
}
