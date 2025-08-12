import { debug } from '@sentry/core';
import * as chalk from 'chalk';
import * as path from 'path';
import type { RouteManifest } from '../manifest/types';
import type { NextConfigObject, TurbopackOptions, TurbopackRuleConfigItemOrShortcut } from '../types';

/**
 * Construct a Turbopack config object from a Next.js config object and a Turbopack options object.
 *
 * @param userNextConfig - The Next.js config object.
 * @param turbopackOptions - The Turbopack options object.
 * @returns The Turbopack config object.
 */
export function constructTurbopackConfig({
  userNextConfig,
  routeManifest,
  nextJsVersion,
}: {
  userNextConfig: NextConfigObject;
  routeManifest?: RouteManifest;
  nextJsVersion?: string;
}): TurbopackOptions {
  const newConfig: TurbopackOptions = {
    ...userNextConfig.turbopack,
  };

  const isomorphicValues = {
    _sentryNextJsVersion: nextJsVersion || '',
  };

  const clientValues = {
    ...isomorphicValues,
    _sentryRouteManifest: JSON.stringify(routeManifest),
  };

  const serverValues = {
    ...isomorphicValues,
  };

  // Client value injection
  newConfig.rules = safelyAddTurbopackRule(newConfig.rules, {
    matcher: '**/instrumentation-client.*',
    rule: {
      loaders: [
        {
          loader: path.resolve(__dirname, '..', 'loaders', 'valueInjectionLoader.js'),
          options: {
            ...clientValues,
          },
        },
      ],
    },
  });

  // Server value injection
  newConfig.rules = safelyAddTurbopackRule(newConfig.rules, {
    matcher: '**/instrumentation.*',
    rule: {
      loaders: [
        {
          loader: path.resolve(__dirname, '..', 'loaders', 'valueInjectionLoader.js'),
          options: {
            ...serverValues,
          },
        },
      ],
    },
  });

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
  { matcher, rule }: { matcher: string; rule: TurbopackRuleConfigItemOrShortcut },
): TurbopackOptions['rules'] {
  if (!existingRules) {
    return {
      [matcher]: rule,
    };
  }

  // If the rule already exists, we don't want to mess with it.
  if (existingRules[matcher]) {
    debug.log(
      `${chalk.cyan(
        'info',
      )} - Turbopack rule already exists for ${matcher}. Please remove it from your Next.js config in order for Sentry to work properly.`,
    );
    return existingRules;
  }

  return {
    ...existingRules,
    [matcher]: rule,
  };
}
