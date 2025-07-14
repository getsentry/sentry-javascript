import * as path from 'path';
import type { RouteManifest } from '../manifest/types';
import type {
  NextConfigObject,
  SentryBuildOptions,
  TurbopackOptions,
  TurbopackRuleConfigItemOrShortcut,
} from '../types';

/**
 * Construct a Turbopack config object from a Next.js config object and a Turbopack options object.
 *
 * @param nextConfig - The Next.js config object.
 * @param turbopackOptions - The Turbopack options object.
 * @returns The Turbopack config object.
 */
export function constructTurbopackConfig({
  userNextConfig,
  routeManifest,
}: {
  userNextConfig: NextConfigObject;
  routeManifest?: RouteManifest;
}): TurbopackOptions {
  const newConfig: TurbopackOptions = {
    ...userNextConfig.turbopack,
  };

  if (routeManifest) {
    newConfig.rules = safelyAddTurbopackRule(newConfig.rules, {
      matcher: '**/instrumentation-client.*',
      rule: {
        loaders: [
          {
            loader: path.resolve(__dirname, '../loaders/valueInjectionLoader.js'),
            options: {
              values: {
                _sentryRouteManifest: JSON.stringify(routeManifest),
              },
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
  { matcher, rule }: { matcher: string; rule: TurbopackRuleConfigItemOrShortcut },
): TurbopackOptions['rules'] {
  if (!existingRules) {
    return {
      [matcher]: rule,
    };
  }

  // If the rule already exists, we don't want to mess with it.
  if (existingRules[matcher]) {
    return existingRules;
  }

  return {
    ...existingRules,
    [matcher]: rule,
  };
}
