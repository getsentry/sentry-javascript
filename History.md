# 0.4.0 - ...
 * Silence and disable Raven/Sentry when using a non-existent or falsey DSN value

# 0.3.0 - 6/23/2012
 * Separate transports out into their own module for portability
 * Added UDP transport [Fixes #10]
 * Ignore sub-transports, such as gevent+https, raven sees it as just https

# 0.2.4 - 6/16/2012
 * Added parsing DSNs with non-standard port. [Fixes #4]
 * Added BSD license

# 0.2.3 - 3/30/2012
 * Prevent any potentially odd stack traces from causing Raven to crash. [Fixes #2]

# 0.2.2 - 3/22/2012
 * raven.Client now emits `logged` and `error` events.

# 0.2.1 - 3/22/2012
 * Fixed connect/express middleware, thanks Almad!

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