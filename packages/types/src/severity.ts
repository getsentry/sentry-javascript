// Note: If this is ever changed, the `validSeverityLevels` array in `@sentry/core` needs to be changed, also. (See
// note there for why we can't derive one from the other.)
export type SeverityLevel = 'fatal' | 'error' | 'warning' | 'log' | 'info' | 'debug';
