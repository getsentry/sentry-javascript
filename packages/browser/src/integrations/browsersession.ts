import { captureSession, debug, defineIntegration, getIsolationScope, startSession } from '@sentry/core';
import { addHistoryInstrumentationHandler } from '@sentry-internal/browser-utils';
import { DEBUG_BUILD } from '../debug-build';
import { WINDOW } from '../helpers';

interface BrowserSessionOptions {
  /**
   * Controls the session lifecycle - when new sessions are created.
   *
   * - `'route'`: A session is created on page load and on every navigation.
   *   This is the default behavior.
   * - `'page'`: A session is created once when the page is loaded. Session is not
   *   updated on navigation. This is useful for webviews or single-page apps where
   *   URL changes should not trigger new sessions.
   *
   * @default 'route'
   */
  lifecycle?: 'route' | 'page';
}

/**
 * When added, automatically creates sessions which allow you to track adoption and crashes (crash free rate) in your Releases in Sentry.
 * More information: https://docs.sentry.io/product/releases/health/
 *
 * Note: In order for session tracking to work, you need to set up Releases: https://docs.sentry.io/product/releases/
 */
export const browserSessionIntegration = defineIntegration((options: BrowserSessionOptions = {}) => {
  const lifecycle = options.lifecycle ?? 'route';

  return {
    name: 'BrowserSession',
    setupOnce() {
      if (typeof WINDOW.document === 'undefined') {
        DEBUG_BUILD &&
          debug.warn('Using the `browserSessionIntegration` in non-browser environments is not supported.');
        return;
      }

      // The session duration for browser sessions does not track a meaningful
      // concept that can be used as a metric.
      // Automatically captured sessions are akin to page views, and thus we
      // discard their duration.
      startSession({ ignoreDuration: true });
      captureSession();

      // User data can be set at any time, for example async after Sentry.init has run and the initial session
      // envelope was already sent, but still on the initial page.
      // Therefore, we have to update the ongoing session with the new user data if it exists, to send the `did`.
      // In theory, sessions, as well as user data is always put onto the isolation scope. So we listen to the
      // isolation scope for changes and update the session with the new user data if it exists.
      // This will not catch users set onto other scopes, like the current scope. For now, we'll accept this limitation.
      // The alternative is to update and capture the session from within the scope. This could be too costly or would not
      // play well with session aggregates on the server side. Since this happens in the scope class, we'd need change
      // scope behaviour in the browser.
      const isolationScope = getIsolationScope();
      let previousUser = isolationScope.getUser();
      getIsolationScope().addScopeListener(scope => {
        const maybeNewUser = scope.getUser();
        if (previousUser?.id !== maybeNewUser?.id || previousUser?.ip_address !== maybeNewUser?.ip_address) {
          // the scope class already writes the user to its session, so we only need to capture the session here
          captureSession();
          previousUser = maybeNewUser;
        }
      });

      if (lifecycle === 'route') {
        // We want to create a session for every navigation as well
        addHistoryInstrumentationHandler(({ from, to }) => {
          // Don't create an additional session for the initial route or if the location did not change
          if (from !== undefined && from !== to) {
            startSession({ ignoreDuration: true });
            captureSession();
          }
        });
      }
    },
  };
});
