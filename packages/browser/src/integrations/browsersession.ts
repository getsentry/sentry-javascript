import { captureSession, debug, defineIntegration, getIsolationScope, startSession } from '@sentry/core/browser';
import { addHistoryInstrumentationHandler, whenIdleOrHidden } from '@sentry/browser-utils';
import { DEBUG_BUILD } from '../debug-build';
import { WINDOW } from '../helpers';

interface BrowserSessionOptions {
  /**
   * Controls the session lifecycle - when new sessions are created.
   *
   * - `'page'`: A session is created once when the page is loaded. Session is not
   *   updated on navigation. This is the default behavior.
   * - `'route'`: A session is created on page load and on every navigation.
   *
   * @default 'page'
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
  const lifecycle = options.lifecycle ?? 'page';

  return {
    name: 'BrowserSession' as const,
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

      // Sending the session envelope synchronously in `init()` runs the full send
      // pipeline during page load, competing with critical resources for the network and
      // adding overhead that measurably hurts LCP. We defer the initial send until the
      // browser is idle; `whenIdleOrHidden` flushes it on page-hide so we don't lose short
      // (page-view-like) sessions.
      let initialSessionSent = false;
      whenIdleOrHidden(() => {
        // A navigation (in `'route'` lifecycle) may start and send a new session before this
        // deferred callback fires. In that case the current session was already sent, so
        // re-capturing here would send it a second time - guard against that.
        if (!initialSessionSent) {
          captureSession();
          initialSessionSent = true;
        }
      });

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
      isolationScope.addScopeListener(scope => {
        const maybeNewUser = scope.getUser();
        // sessions only care about user id and ip address, so we only need to capture the session if the user has changed
        if (previousUser?.id !== maybeNewUser?.id || previousUser?.ip_address !== maybeNewUser?.ip_address) {
          previousUser = maybeNewUser;
          // Only emit a dedicated update envelope for user data that arrives _after_ the
          // deferred initial session was sent. User data set during page load is already
          // reflected in that session (the scope writes it onto the session), so capturing
          // here would send a redundant envelope - and do so during page load, which is
          // exactly the overhead we're deferring away from.
          if (initialSessionSent) {
            captureSession();
          }
        }
      });

      if (lifecycle === 'route') {
        // We want to create a session for every navigation as well
        addHistoryInstrumentationHandler(({ from, to }) => {
          // Don't create an additional session for the initial route or if the location did not change
          if (from !== to) {
            startSession({ ignoreDuration: true });
            captureSession();
            // A session has now been sent, so the deferred initial capture (if still pending)
            // must not re-send this navigation session.
            initialSessionSent = true;
          }
        });
      }
    },
  };
});
