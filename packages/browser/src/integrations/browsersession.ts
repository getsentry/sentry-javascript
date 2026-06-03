import {
  captureSession,
  debug,
  defineIntegration,
  getIsolationScope,
  SEMANTIC_ATTRIBUTE_SESSION_ID,
  startSession,
} from '@sentry/core/browser';
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
    setup(client) {
      function attachSessionId<T extends { attributes?: Record<string, unknown> | undefined }>(telemetryItem: T): T {
        const session = getIsolationScope().getSession();
        const attributes = telemetryItem.attributes ?? (telemetryItem.attributes = {});
        if (session?.sid && !attributes?.[SEMANTIC_ATTRIBUTE_SESSION_ID]) {
          attributes[SEMANTIC_ATTRIBUTE_SESSION_ID] = session.sid;
        }
        return telemetryItem;
      }

      client.on('processMetric', attachSessionId);
      client.on('beforeCaptureLog', attachSessionId);
      // only applies to streamed spans
      client.on('processSpan', attachSessionId);

      // for errors and transactions (non-streamed spans)
      client.addEventProcessor(event => {
        if (event.type && event.type !== 'transaction') {
          // ignore other events than errors and transactions for now
          return event;
        }

        const sessionId = getIsolationScope().getSession()?.sid;
        if (!sessionId) {
          return event;
        }

        // set a session context on the event. Relay will extract the `session.id`
        // tag from this context which will make it queryable in the UI.
        event.contexts = {
          session: {
            id: sessionId,
          },
          ...event.contexts,
        };

        event.spans?.forEach(span => {
          span.data = {
            [SEMANTIC_ATTRIBUTE_SESSION_ID]: sessionId,
            ...span.data,
          };
        });

        return event;
      });
    },
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
      isolationScope.addScopeListener(scope => {
        const maybeNewUser = scope.getUser();
        // sessions only care about user id and ip address, so we only need to capture the session if the user has changed
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
          if (from !== to) {
            startSession({ ignoreDuration: true });
            captureSession();
          }
        });
      }
    },
  };
});
