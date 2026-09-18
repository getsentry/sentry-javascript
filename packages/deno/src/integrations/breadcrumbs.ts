import type { Client, Event as SentryEvent, IntegrationFn } from '@sentry/core';
import { addBreadcrumb, consoleSandbox, defineIntegration, getClient, getEventDescription } from '@sentry/core';

interface BreadcrumbsOptions {
  sentry: boolean;

  /**
   * @deprecated Fetch breadcrumbs are recorded by `fetchIntegration`. Disable them with
   * `fetchIntegration({ breadcrumbs: false })` instead. This option no longer has any effect and
   * will be removed in a future major version.
   */
  fetch: boolean;
}

const INTEGRATION_NAME = 'Breadcrumbs' as const;

/**
 * Note: This `breadcrumbsIntegration` is almost the same as the one from @sentry/browser.
 * The Deno-version does not support browser-specific APIs like dom, xhr and history.
 */
const _breadcrumbsIntegration = ((options: Partial<BreadcrumbsOptions> = {}) => {
  if ('fetch' in options) {
    consoleSandbox(() => {
      // oxlint-disable-next-line no-console
      console.warn(
        '[Sentry] `breadcrumbsIntegration({ fetch })` is deprecated and no longer has any effect. Fetch breadcrumbs are recorded by `fetchIntegration`; disable them with `fetchIntegration({ breadcrumbs: false })`.',
      );
    });
  }

  const _options = {
    sentry: true,
    ...options,
  };

  return {
    name: INTEGRATION_NAME,
    setup(client) {
      if (_options.sentry) {
        client.on('beforeSendEvent', _getSentryBreadcrumbHandler(client));
      }
    },
  };
}) satisfies IntegrationFn;

/**
 * Adds breadcrumbs for sentry events.
 *
 * Fetch breadcrumbs come from `fetchIntegration`.
 *
 * Enabled by default in the Deno SDK.
 *
 * ```js
 * Sentry.init({
 *   integrations: [
 *     Sentry.breadcrumbsIntegration(),
 *   ],
 * })
 * ```
 */
export const breadcrumbsIntegration = defineIntegration(_breadcrumbsIntegration);

/**
 * Adds a breadcrumb for Sentry events or transactions if this option is enabled.
 *
 */
function _getSentryBreadcrumbHandler(client: Client): (event: SentryEvent) => void {
  return function addSentryBreadcrumb(event: SentryEvent): void {
    if (getClient() !== client) {
      return;
    }

    addBreadcrumb(
      {
        category: `sentry.${event.type === 'transaction' ? 'transaction' : 'event'}`,
        event_id: event.event_id,
        level: event.level,
        message: getEventDescription(event),
      },
      {
        event,
      },
    );
  };
}
