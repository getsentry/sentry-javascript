import { debug } from '@sentry/core';
import type { RouteManifest } from '../manifest/types';
import type { NextConfigObject, SentryBuildOptions, TurbopackMatcherWithRule, TurbopackOptions } from '../types';
import { supportsNativeDebugIds } from '../util';
import { generateValueInjectionRules } from './generateValueInjectionRules';

/**
 * Construct a Turbopack config object from a Next.js config object and a Turbopack options object.
 *
 * @param userNextConfig - The Next.js config object.
 * @param userSentryOptions - The Sentry build options object.
 * @param routeManifest - The route manifest object.
 * @param nextJsVersion - The Next.js version.
 * @returns The Turbopack config object.
 */
export function constructTurbopackConfig({
  userNextConfig,
  userSentryOptions,
  routeManifest,
  nextJsVersion,
}: {
  userNextConfig: NextConfigObject;
  userSentryOptions?: SentryBuildOptions;
  routeManifest?: RouteManifest;
  nextJsVersion?: string;
}): TurbopackOptions {
  // If sourcemaps are disabled, we don't need to enable native debug ids as this will add build time.
  const shouldEnableNativeDebugIds =
    (supportsNativeDebugIds(nextJsVersion ?? '') && userNextConfig?.turbopack?.debugIds) ??
    userSentryOptions?.sourcemaps?.disable !== true;

  const newConfig: TurbopackOptions = {
    ...userNextConfig.turbopack,
    ...(shouldEnableNativeDebugIds ? { debugIds: true } : {}),
  };

  const tunnelPath =
    userSentryOptions?.tunnelRoute !== undefined &&
    userNextConfig.output !== 'export' &&
    typeof userSentryOptions.tunnelRoute === 'string'
      ? `${userNextConfig.basePath ?? ''}${userSentryOptions.tunnelRoute}`
      : undefined;

  const valueInjectionRules = generateValueInjectionRules({
    routeManifest,
    nextJsVersion,
    tunnelPath,
  });

  for (const { matcher, rule } of valueInjectionRules) {
    newConfig.rules = safelyAddTurbopackRule(newConfig.rules, { matcher, rule });
  }

  return newConfig;
}

/**
 * Safely add a Turbopack rule to the existing rules.
 *
 * @param existingRules - The existing rules.
 * @param matcher - The matcher for the rule.
 * @param rule - The rule to add.
 * @returns The updated rules object.
 */
export function safelyAddTurbopackRule(
  existingRules: TurbopackOptions['rules'],
  { matcher, rule }: TurbopackMatcherWithRule,
): TurbopackOptions['rules'] {
  if (!existingRules) {
    return {
      [matcher]: rule,
    };
  }

  // If the rule already exists, we don't want to mess with it.
  if (existingRules[matcher]) {
    debug.log(
      `[@sentry/nextjs] - Turbopack rule already exists for ${matcher}. Please remove it from your Next.js config in order for Sentry to work properly.`,
    );
    return existingRules;
  }

  return {
    ...existingRules,
    [matcher]: rule,
  };
}
