// Internal to Sentry SDKs, not public API. Kept separate from `./core` so bundler loaders
// don't pull in the build plugin manager and the `sentry` CLI.
export { getCodeInjectionPosition } from '../core/get-code-injection-position';
export { createComponentNameAnnotateHooks } from '../core/component-annotate-hooks';
