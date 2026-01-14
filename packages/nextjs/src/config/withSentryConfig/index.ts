import { isThenable } from '@sentry/core';
import type { ExportedNextConfig as NextConfig, NextConfigFunction, SentryBuildOptions } from '../types';
import { DEFAULT_SERVER_EXTERNAL_PACKAGES } from './constants';
import { getFinalConfigObject } from './getFinalConfigObject';

export { DEFAULT_SERVER_EXTERNAL_PACKAGES };

/**
 * Wraps a user's Next.js config and applies Sentry build-time behavior (instrumentation + sourcemap upload).
 *
 * Supports both object and function Next.js configs.
 *
 * @param nextConfig - The user's exported Next.js config
 * @param sentryBuildOptions - Options to configure Sentry's build-time behavior
 * @returns The wrapped Next.js config (same shape as the input)
 */
export function withSentryConfig<C>(nextConfig?: C, sentryBuildOptions: SentryBuildOptions = {}): C {
  const castNextConfig = (nextConfig as NextConfig) || {};
  if (typeof castNextConfig === 'function') {
    return function (this: unknown, ...webpackConfigFunctionArgs: unknown[]): ReturnType<NextConfigFunction> {
      const maybePromiseNextConfig: ReturnType<typeof castNextConfig> = castNextConfig.apply(
        this,
        webpackConfigFunctionArgs,
      );

      if (isThenable(maybePromiseNextConfig)) {
        return maybePromiseNextConfig.then(promiseResultNextConfig => {
          return getFinalConfigObject(promiseResultNextConfig, sentryBuildOptions);
        });
      }

      return getFinalConfigObject(maybePromiseNextConfig, sentryBuildOptions);
    } as C;
  } else {
    return getFinalConfigObject(castNextConfig, sentryBuildOptions) as C;
  }
}
