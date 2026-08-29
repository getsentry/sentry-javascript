import {
  captureSession,
  debug,
  defineIntegration,
  getIsolationScope,
  SEMANTIC_ATTRIBUTE_SESSION_ID,
  startSession,
} from '@sentry/core/browser';
import {
  addClickKeypressInstrumentationHandler,
  addHistoryInstrumentationHandler,
  whenIdleOrHidden,
} from '@sentry/browser-utils';
import { DEBUG_BUILD } from '../debug-build';
import { WINDOW } from '../helpers';
import { setSessionRotator } from '../session/lifecycle';
import type { PersistedSession, SessionExpiryOptions } from '../session/persistence';
import { getPersistedSession, isSessionExpired, persistSession } from '../session/persistence';

const DEFAULT_IDLE_TIMEOUT = 30 * 60_000;
const DEFAULT_MAX_DURATION = 8 * 60 * 60_000;

// Writing to sessionStorage on every interaction is wasteful, and a few seconds of
// staleness is immaterial against timeouts measured in minutes.
const PERSIST_THROTTLE = 5_000;

interface BrowserSessionOptions {
  /**
   * Controls the session lifecycle - when new sessions are created.
   *
   * - `'page'`: A session is created once when the page is loaded. Session is not
   *   updated on navigation. This is the default behavior.
   * - `'route'`: A session is created on page load and on every navigation.
   * - `'session'`: One session spans the user's whole visit to the site. It is persisted in
   *   `sessionStorage` and resumed across reloads and navigations until it expires
   *   (see `idleTimeout` and `maxDuration`).
   *
   * @default 'page'
   */
  lifecycle?: 'route' | 'page' | 'session';

  /**
   * How long the user can be inactive, in milliseconds, before the next interaction starts
   * a new session. Only applies to the `'session'` lifecycle.
   *
   * Activity means the user did something (a click, a key press, a scroll, a navigation).
   * Telemetry the app emits on its own does not keep a session alive, otherwise a tab left
   * open in the background would hold one open indefinitely.
   *
   * @default 1_800_000 (30 minutes)
   */
  idleTimeout?: number;

  /**
   * The maximum lifetime of a session in milliseconds, regardless of activity. Only applies
   * to the `'session'` lifecycle.
   *
   * @default 28_800_000 (8 hours)
   */
  maxDuration?: number;
}

/**
 * Starts a session, resuming @param resume if one was handed over from a previous page load,
 * and writes it back to `sessionStorage`.
 */
function startAndPersistSession(resume?: PersistedSession): PersistedSession {
  const now = Date.now();

  // `ignoreDuration` stays on: a session now has a meaningful duration, but reporting it would
  // change what release health's session duration distribution measures, which is out of scope here.
  const session = startSession(
    resume
      ? // `init: false` marks this as an update to an already-counted session rather than a new
        // one, so resuming across a page load does not inflate release health session counts.
        { sid: resume.sid, started: resume.started / 1000, init: false, ignoreDuration: true }
      : { ignoreDuration: true },
  );

  // The persisted record is kept on the `Date` clock throughout. Session timestamps come from
  // `performance.timeOrigin`, which is reset for every document, so they are not comparable
  // across the page loads this record has to survive.
  const persisted = { sid: session.sid, started: resume ? resume.started : now, lastActivity: now };
  persistSession(persisted);

  return persisted;
}

/**
 * When added, automatically creates sessions which allow you to track adoption and crashes (crash free rate) in your Releases in Sentry.
 * More information: https://docs.sentry.io/product/releases/health/
 *
 * Note: In order for session tracking to work, you need to set up Releases: https://docs.sentry.io/product/releases/
 */
export const browserSessionIntegration = defineIntegration((options: BrowserSessionOptions = {}) => {
  const lifecycle = options.lifecycle ?? 'page';
  const expiry: SessionExpiryOptions = {
    idleTimeout: options.idleTimeout ?? DEFAULT_IDLE_TIMEOUT,
    maxDuration: options.maxDuration ?? DEFAULT_MAX_DURATION,
  };

  return {
    name: 'BrowserSession' as const,
    setupOnce() {
      if (typeof WINDOW.document === 'undefined') {
        DEBUG_BUILD &&
          debug.warn('Using the `browserSessionIntegration` in non-browser environments is not supported.');
        return;
      }

      // Sending the session envelope synchronously in `init()` runs the full send
      // pipeline during page load, competing with critical resources for the network and
      // adding overhead that measurably hurts LCP. We defer the initial send until the
      // browser is idle; `whenIdleOrHidden` flushes it on page-hide so we don't lose short
      // (page-view-like) sessions.
      let initialSessionSent = false;

      // Ends the current session and starts a new one in its place, sending it right away. Expiry,
      // navigation (in the `'route'` lifecycle) and the public `endSession()` all funnel through here.
      let rotate: () => void;

      if (lifecycle === 'session') {
        const persisted = getPersistedSession();
        const now = Date.now();
        let current = startAndPersistSession(
          persisted && !isSessionExpired(persisted, expiry, now) ? persisted : undefined,
        );
        let lastPersistedAt = current.lastActivity;

        rotate = () => {
          current = startAndPersistSession();
          lastPersistedAt = current.lastActivity;
          captureSession();
          // A session has now been sent, so the deferred initial capture (if still pending)
          // must not re-send this session.
          initialSessionSent = true;
        };

        const onActivity = (): void => {
          const activityAt = Date.now();

          if (isSessionExpired(current, expiry, activityAt)) {
            rotate();
            return;
          }

          current.lastActivity = activityAt;
          if (activityAt - lastPersistedAt > PERSIST_THROTTLE) {
            persistSession(current);
            lastPersistedAt = activityAt;
          }
        };

        // Clicks and key presses are already instrumented for breadcrumbs, so subscribing here
        // adds no additional listeners in the common case.
        addClickKeypressInstrumentationHandler(onActivity);
        addHistoryInstrumentationHandler(onActivity);
        // Scroll does not bubble, so it has to be caught on the way down.
        WINDOW.document.addEventListener('scroll', onActivity, { capture: true, passive: true });
      } else {
        // The session duration for browser sessions does not track a meaningful
        // concept that can be used as a metric.
        // Automatically captured sessions are akin to page views, and thus we
        // discard their duration.
        startSession({ ignoreDuration: true });

        rotate = () => {
          startSession({ ignoreDuration: true });
          captureSession();
          initialSessionSent = true;
        };
      }

      setSessionRotator(rotate);

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
            rotate();
          }
        });
      }
    },

    // Streamed telemetry (spans, logs, metrics) carries the session id as an attribute.
    setup(client) {
      const attachSessionId = (item: { attributes?: Record<string, unknown> }): void => {
        const sid = getIsolationScope().getSession()?.sid;
        if (sid && item.attributes?.[SEMANTIC_ATTRIBUTE_SESSION_ID] === undefined) {
          (item.attributes ??= {})[SEMANTIC_ATTRIBUTE_SESSION_ID] = sid;
        }
      };

      client.on('processSpan', attachSessionId);
      client.on('beforeCaptureLog', attachSessionId);
      client.on('processMetric', attachSessionId);
    },

    // Errors flow through the event pipeline, not span streaming, so tag them.
    processEvent(event) {
      const sid = getIsolationScope().getSession()?.sid;
      // `!event.type` narrows to error events (transactions/replays are typed).
      if (sid && !event.type && event.tags?.[SEMANTIC_ATTRIBUTE_SESSION_ID] === undefined) {
        (event.tags ??= {})[SEMANTIC_ATTRIBUTE_SESSION_ID] = sid;
      }
      return event;
    },
  };
});
