import { debug, getClient, getGlobalSingleton, getReportDialogEndpoint, SDK_VERSION } from '@sentry/core';
import { DEBUG_BUILD } from './debug-build';
import { WINDOW } from './types';

// Part of the public contract: pages allow this name in their `trusted-types` CSP directive.
const POLICY_NAME = 'sentry-sdk';

// The DOM lib has no Trusted Types definitions.
interface ScriptURLPolicy {
  createScriptURL(input: string): unknown;
}

interface TrustedTypesWindow {
  trustedTypes?: {
    createPolicy(name: string, rules: { createScriptURL(input: string): string }): ScriptURLPolicy;
  };
}

/** The base URL that `lazyLoadIntegration` loads bundles from. */
export function getCdnBaseUrl(): string {
  const options = getClient()?.getOptions() as { cdnBaseUrl?: string } | undefined;
  return options?.cdnBaseUrl || 'https://browser.sentry-cdn.com';
}

function isReportDialogURL(input: string): boolean {
  const dsn = getClient()?.getDsn();
  // Matching up to and including the `?` pins the origin and the full path, so only the query can vary.
  return !!dsn && input.startsWith(`${getReportDialogEndpoint(dsn, {}).split('?')[0]}?`);
}

function isCdnBundleURL(input: string): boolean {
  const prefix = new URL(`/${SDK_VERSION}/`, getCdnBaseUrl()).toString();
  return input.startsWith(prefix) && /^[a-z-]+\.min\.js$/.test(input.slice(prefix.length));
}

// The policy can't know which blob URLs the SDK created: they may come from another copy of the SDK that shares it.
// Creating one for this origin already requires running script in it.
function isBlobURL(input: string): boolean {
  return input.startsWith(`blob:${WINDOW.origin}/`);
}

function createScriptURL(input: string): string {
  if (!isBlobURL(input) && !isReportDialogURL(input) && !isCdnBundleURL(input)) {
    throw new TypeError(`Refusing to load ${input} as a Sentry SDK script`);
  }
  return input;
}

function createPolicy(): ScriptURLPolicy {
  try {
    const policy = (WINDOW as TrustedTypesWindow).trustedTypes?.createPolicy(POLICY_NAME, { createScriptURL });
    if (policy) {
      return policy;
    }
  } catch (error) {
    DEBUG_BUILD &&
      debug.warn(
        `Could not create the "${POLICY_NAME}" Trusted Types policy. Add it to your \`trusted-types\` CSP directive (with \`'allow-duplicates'\` if the policy is created more than once, e.g. by different SDK versions on the same page).`,
        error,
      );
  }
  return { createScriptURL: input => input };
}

/**
 * Returns `url` as a value for script URL sinks (`script.src`, `new Worker()`) on pages that enforce Trusted Types.
 *
 * This is a `TrustedScriptURL` (typed as `string`, like the sinks in the DOM lib) if the policy could be created, and
 * the unchanged string otherwise. With a policy, it throws for URLs the SDK is not expected to load.
 */
export function getTrustedScriptURL(url: string): string {
  return getGlobalSingleton('trustedTypesPolicy', createPolicy).createScriptURL(url) as string;
}
