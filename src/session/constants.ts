export const REPLAY_SESSION_KEY = 'sentryReplaySession';
export const REPLAY_EVENT_NAME = 'replay_event';
export const RECORDING_EVENT_NAME = 'replay_recording';

// The idle limit for a session
export const SESSION_IDLE_DURATION = 900000; // 15 minutes

// Grace period to keep a session when a user changes tabs or hides window
export const VISIBILITY_CHANGE_TIMEOUT = SESSION_IDLE_DURATION;
