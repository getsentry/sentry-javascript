import { createComponentNameAnnotateHooks } from '@sentry/bundler-plugin-core';
import type { LoaderThis } from './types';

export type ComponentAnnotationLoaderOptions = {
  ignoredComponents?: string[];
};

/**
 * Turbopack loader that annotates React components with `data-sentry-component`,
 * `data-sentry-element`, and `data-sentry-source-file` attributes.
 *
 * This is the Turbopack equivalent of what `@sentry/webpack-plugin` does
 * via the `reactComponentAnnotation` option and `@sentry/babel-plugin-component-annotate`.
 *
 * Options:
 *   - `ignoredComponents`: List of component names to exclude from annotation.
 */
export default function componentAnnotationLoader(
  this: LoaderThis<ComponentAnnotationLoaderOptions>,
  userCode: string,
): void {
  const options = 'getOptions' in this ? this.getOptions() : this.query;
  const ignoredComponents = options.ignoredComponents ?? [];

  // We do not want to cache results across builds
  this.cacheable(false);

  const callback = this.async() ?? this.callback;

  const hooks = createComponentNameAnnotateHooks(ignoredComponents, false);

  hooks
    .transform(userCode, this.resourcePath)
    .then(result => {
      if (result) {
        callback(null, result.code, result.map);
      } else {
        callback(null, userCode);
      }
    })
    .catch(() => {
      // On error, pass through the original code gracefully
      callback(null, userCode);
    });
}
