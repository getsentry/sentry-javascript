import { GLOBAL_OBJ } from '@sentry/utils';

// exporting a separate copy of `WINDOW` rather than exporting the one from `@sentry/browser`
// prevents the browser package from being bundled in the CDN bundle, and avoids a
// circular dependency between the browser and replay packages should `@sentry/browser` import
// from `@sentry/replay` in the future
export const WINDOW = GLOBAL_OBJ as typeof GLOBAL_OBJ & Window;

export const REPLAY_SESSION_KEY = 'sentryReplaySession';
export const REPLAY_EVENT_NAME = 'replay_event';
export const RECORDING_EVENT_NAME = 'replay_recording';
export const UNABLE_TO_SEND_REPLAY = 'Unable to send Replay';

// The idle limit for a session
export const SESSION_IDLE_DURATION = 300_000; // 5 minutes in ms

// Grace period to keep a session when a user changes tabs or hides window
export const VISIBILITY_CHANGE_TIMEOUT = SESSION_IDLE_DURATION;

// The maximum length of a session
export const MAX_SESSION_LIFE = 3_600_000; // 60 minutes

/** The select to use for the `maskAllText` option  */
export const MASK_ALL_TEXT_SELECTOR = 'body *:not(style), body *:not(script)';

/** Default flush delays */
export const DEFAULT_FLUSH_MIN_DELAY = 5_000;
export const DEFAULT_FLUSH_MAX_DELAY = 5_000;

/* How often to capture a full checkout when in error mode */
export const ERROR_CHECKOUT_TIME = 30_000;

export const RETRY_BASE_INTERVAL = 5000;
export const RETRY_MAX_COUNT = 3;
