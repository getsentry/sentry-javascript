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
export const MAX_SESSION_LIFE = 1_800_000; // 30 minutes

/**
 * Defaults for sampling rates
 */
export const DEFAULT_SESSION_SAMPLE_RATE = 0.1;
export const DEFAULT_ERROR_SAMPLE_RATE = 1.0;
