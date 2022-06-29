export const REPLAY_SESSION_KEY = 'sentryReplaySession';
export const ROOT_REPLAY_NAME = 'sentry-replay';
export const REPLAY_EVENT_NAME = 'sentry-replay-event';

// The idle limit for a session
export const SESSION_IDLE_DURATION = 900000; // 15 minutes

// Grace period to keep a session when a user changes tabs or hides window
export const VISIBILITY_CHANGE_TIMEOUT = SESSION_IDLE_DURATION;
