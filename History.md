# 0.2.0 - 3/18/2012
 * Renamed all methods to follow `client.capture*()` pattern. (Sorry if you were already using it!)
 * All `npm` installed modules are shoved into Sentry for debugging
 * Toggle actual sending based on `NODE_ENV` variable. Check README for information.
 * Fixes for more types of stack traces.
 * Added `client.captureQuery()`
 * Support for `SENTRY_DSN`, `SENTRY_NAME`, and `SENTRY_SITE` enviornment variables
 * More test coverage

# 0.1.0 - 3/17/2012
 * Initial release