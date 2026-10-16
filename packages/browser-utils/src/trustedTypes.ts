import { debug } from '@sentry/core';
import { DEBUG_BUILD } from './debug-build';
import { WINDOW } from './types';

/**
 * The single Trusted Types policy the SDK mints values through. Pages that enforce
 * Trusted Types add this name to their `trusted-types` CSP directive.
 */
export const TRUSTED_TYPES_POLICY_NAME = 'sentry-sdk';

interface ScriptURLPolicy {
  createScriptURL(input: string): unknown;
}

interface TrustedTypesWindow {
  trustedTypes?: {
    createPolicy(name: string, rules: { createScriptURL(input: string): string }): ScriptURLPolicy;
  };
}

// Script URLs the SDK loads. A kind is added together with the code that loads it, so
// the policy can never be used to load an arbitrary script.
function isSdkScriptURL(input: string): boolean {
  const url = new URL(input);
  const isHttp = url.protocol === 'https:' || url.protocol === 'http:';
  // The report dialog, loaded from the DSN host by `showReportDialog`.
  return isHttp && url.pathname.endsWith('/api/embed/error-page/');
}

// `undefined` until the first attempt, `null` if Trusted Types is unavailable or the
// policy could not be created.
let policy: ScriptURLPolicy | null | undefined;

function getPolicy(): ScriptURLPolicy | null {
  if (policy !== undefined) {
    return policy;
  }

  policy = null;
  const trustedTypes = (WINDOW as TrustedTypesWindow).trustedTypes;
  if (!trustedTypes) {
    return policy;
  }

  try {
    policy = trustedTypes.createPolicy(TRUSTED_TYPES_POLICY_NAME, {
      createScriptURL: (input: string) => {
        if (!isSdkScriptURL(input)) {
          throw new TypeError(`Refusing to load ${input} as a Sentry SDK script`);
        }
        return input;
      },
    });
  } catch (error) {
    DEBUG_BUILD &&
      debug.warn(
        `Could not create the "${TRUSTED_TYPES_POLICY_NAME}" Trusted Types policy. Add it to your \`trusted-types\` CSP directive (with \`'allow-duplicates'\` if more than one Sentry SDK is loaded on the page).`,
        error,
      );
  }

  return policy;
}

/**
 * Returns `url` as a value that can be assigned to a script URL sink (`script.src`,
 * `new Worker()`) on pages that enforce Trusted Types.
 *
 * The result is a `TrustedScriptURL` when Trusted Types is available and the plain
 * string otherwise; it is typed as `string` because the DOM lib has no Trusted Types
 * definitions. Throws for URLs the SDK does not load.
 */
export function getTrustedScriptURL(url: string): string {
  const sdkPolicy = getPolicy();
  return (sdkPolicy ? sdkPolicy.createScriptURL(url) : url) as string;
}
