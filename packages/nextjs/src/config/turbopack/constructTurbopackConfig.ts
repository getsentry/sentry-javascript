import { debug } from '@sentry/core';
import * as path from 'path';
import type { VercelCronsConfig } from '../../common/types';
import type { RouteManifest } from '../manifest/types';
import type { NextConfigObject, SentryBuildOptions, TurbopackMatcherWithRule, TurbopackOptions } from '../types';
import { supportsNativeDebugIds, supportsTurbopackRuleCondition } from '../util';
import { generateValueInjectionRules } from './generateValueInjectionRules';

/**
 * Construct a Turbopack config object from a Next.js config object and a Turbopack options object.
 *
 * @param userNextConfig - The Next.js config object.
 * @param userSentryOptions - The Sentry build options object.
 * @param routeManifest - The route manifest object.
 * @param nextJsVersion - The Next.js version.
 * @param vercelCronsConfig - The Vercel crons configuration from vercel.json.
 * @returns The Turbopack config object.
 */
export function constructTurbopackConfig({
  userNextConfig,
  userSentryOptions,
  routeManifest,
  nextJsVersion,
  vercelCronsConfig,
}: {
  userNextConfig: NextConfigObject;
  userSentryOptions?: SentryBuildOptions;
  routeManifest?: RouteManifest;
  nextJsVersion?: string;
  vercelCronsConfig?: VercelCronsConfig;
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
    vercelCronsConfig,
  });

  for (const { matcher, rule } of valueInjectionRules) {
    newConfig.rules = safelyAddTurbopackRule(newConfig.rules, { matcher, rule });
  }

  // Add module metadata injection loader for thirdPartyErrorFilterIntegration support.
  // This loader tags modules with `_sentryModuleMetadata` so the integration can tell
  // first-party code from third-party code. We intentionally do NOT use
  // `condition: { not: 'foreign' }` so that node_modules are also tagged as first-party,
  // matching the webpack plugin's BannerPlugin behavior (which injects into all chunks
  // without excluding node_modules). The injected code is wrapped in a try-catch IIFE
  // so it is safe even for node_modules with strict initialization order.
  // We only exclude Next.js build polyfills which contain non-standard syntax that causes
  // parse errors when any code is prepended (Turbopack re-parses the loader output).
  const applicationKey = userSentryOptions?._experimental?.turbopackApplicationKey;
  if (applicationKey && nextJsVersion && supportsTurbopackRuleCondition(nextJsVersion)) {
    newConfig.rules = safelyAddTurbopackRule(newConfig.rules, {
      matcher: '*.{ts,tsx,js,jsx,mjs,cjs}',
      rule: {
        condition: { not: { path: /next\/dist\/build\/polyfills/ } },
        loaders: [
          {
            loader: path.resolve(__dirname, '..', 'loaders', 'moduleMetadataInjectionLoader.js'),
            options: {
              applicationKey,
            },
          },
        ],
      },
    });
  }

  // Add component annotation loader for react component name annotation in Turbopack builds.
  // This is only added when turbopackReactComponentAnnotation.enabled is set AND the Next.js
  // version supports the `condition` field in Turbopack rules (Next.js 16+).
  const turbopackReactComponentAnnotation = userSentryOptions?._experimental?.turbopackReactComponentAnnotation;
  if (turbopackReactComponentAnnotation?.enabled && nextJsVersion && supportsTurbopackRuleCondition(nextJsVersion)) {
    newConfig.rules = safelyAddTurbopackRule(newConfig.rules, {
      matcher: '*.{tsx,jsx}',
      rule: {
        condition: { not: 'foreign' },
        loaders: [
          {
            loader: path.resolve(__dirname, '..', 'loaders', 'componentAnnotationLoader.js'),
            options: {
              ignoredComponents: turbopackReactComponentAnnotation.ignoredComponents ?? [],
            },
          },
        ],
      },
    });
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
