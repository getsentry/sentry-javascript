import { defineIntegration } from '../integration';
import type { StackFrame } from '../types-hoist';
import { GLOBAL_OBJ, isErrorEvent } from '../utils-hoist';
import { getFramesFromEvent } from '../utils-hoist/stacktrace';

type DomainBasedErrorsFilterOptions = {
  /**
   * List of domains that are considered "first-party" (your application domains).
   * Errors from these domains will not be filtered.
   * Example: ['myapp.com', 'cdn.myapp.com']
   */
  appDomains: string[];

  /**
   * List of third-party domains that should be allowed despite not being in appDomains.
   * Errors from these domains will not be filtered.
   *
   */
  allowlistedDomains?: string[];

  /**
   * Defines how the integration should behave with third-party errors.
   *
   * - `drop-error-if-contains-third-party-frames`: Drop error events that contain at least one third-party stack frame.
   * - `drop-error-if-exclusively-contains-third-party-frames`: Drop error events that exclusively contain third-party stack frames.
   * - `apply-tag-if-contains-third-party-frames`: Keep all error events, but apply a `third_party_domain: true` tag in case the error contains at least one third-party stack frame.
   * - `apply-tag-if-exclusively-contains-third-party-frames`: Keep all error events, but apply a `third_party_domain: true` tag in case the error exclusively contains third-party stack frames.
   */
  behaviour:
    | 'drop-error-if-contains-third-party-frames'
    | 'drop-error-if-exclusively-contains-third-party-frames'
    | 'apply-tag-if-contains-third-party-frames'
    | 'apply-tag-if-exclusively-contains-third-party-frames';

  /**
   * Whether to apply the `is_external` flag to stack frames from third-party domains.
   *
   * Default: `false`
   */
  applyIsExternalFrameFlag?: boolean;
};

export const _experimentalDomainBasedErrorsFilterIntegration = defineIntegration(
  (options: DomainBasedErrorsFilterOptions) => {
    const isRunningOnLocalhost = (): boolean => {
      // Check if we're in a browser environment
      const WINDOW = GLOBAL_OBJ as typeof GLOBAL_OBJ & Window;
      if (WINDOW?.location?.href) {
        const href = WINDOW.location.href;

        // todo: add a more advanced check
        if (href.includes('://localhost:') || href.includes('://127.0.0.1')) {
          return true;
        }
      }

      return false;
    };

    const isLocalhost = isRunningOnLocalhost();

    return {
      name: '_experimentalDomainBasedErrorsFilter',
      processEvent(event) {
        // skip for non error events and locally running apps
        if (isLocalhost || !isErrorEvent(event)) {
          return event;
        }

        const frames = getFramesFromEvent(event);
        if (!frames || frames.length === 0) {
          return event;
        }

        // collect firstParty domains
        // todo: get a sensible default, maybe href + subdomains
        const appDomains = options.appDomains || [];

        // todo: merge this list with clientOptions.allowUrls
        const allowlistedDomains = options.allowlistedDomains || [];

        let hasThirdPartyFrames = false;
        let allFramesAreThirdParty = true;

        frames.forEach(frame => {
          // todo: check abs_path or filename here?
          if (frame.abs_path) {
            try {
              const url = new URL(frame.abs_path);
              const domain = url.hostname;

              const isExternal = isThirdPartyDomain(domain, appDomains, allowlistedDomains);

              // Add is_external flag to the frame
              if (options.applyIsExternalFrameFlag) {
                (frame as StackFrame & { is_external?: boolean }).is_external = isExternal;
              }

              if (isExternal) {
                hasThirdPartyFrames = true;
              } else {
                allFramesAreThirdParty = false;
              }
            } catch (e) {
              // can't get URL
              allFramesAreThirdParty = false;
            }
          } else {
            // No abs path
            allFramesAreThirdParty = false;
          }
        });

        let applyTag = false;

        if (hasThirdPartyFrames) {
          if (options.behaviour === 'drop-error-if-contains-third-party-frames') {
            return null;
          }
          if (options.behaviour === 'apply-tag-if-contains-third-party-frames') {
            applyTag = true;
          }
        }

        if (allFramesAreThirdParty) {
          if (options.behaviour === 'drop-error-if-exclusively-contains-third-party-frames') {
            return null;
          }
          if (options.behaviour === 'apply-tag-if-exclusively-contains-third-party-frames') {
            applyTag = true;
          }
        }

        if (applyTag) {
          event.tags = {
            ...event.tags,
            third_party_code: true,
          };
        }

        return event;
      },
    };
  },
);

const isThirdPartyDomain = (domain: string, appDomains: string[], allowlistedDomains: string[]): boolean => {
  const isAppDomain = appDomains.some(appDomain => domain === appDomain || domain.endsWith(`.${appDomain}`));

  if (isAppDomain) {
    return false;
  }

  // todo: extend this check also check for regexes
  const isAllowlisted = allowlistedDomains?.some(
    allowedDomain => domain === allowedDomain || domain.endsWith(`.${allowedDomain}`),
  );

  return !isAllowlisted;
};
