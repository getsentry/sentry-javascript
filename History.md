# 0.5.0 - 4/8/2013
  * Remove NODE_ENV entirely, fixes many issues since people have different opinions on wtf this means
  * Several fixes in collecting a better stack trace, thanks @azylman
  * Pass exception through to the patchGlobal callback, thanks @ktmud [See #28]
  * Official 0.10 support!
  * Other misc things. https://github.com/mattrobenolt/raven-node/compare/v0.4.7...v0.5.0

# 0.4.7 - 1/13/2013
  * Actually disable when NODE_ENV does not equal 'production' [Fixes #25]

# 0.4.6 - 1/13/2013
  * Added `platform=node` to payload for Sentry 5.1

# 0.4.5 - 12/05/2012
  * Resolve `node_modules` path properly [Fixes #23]

# 0.4.4 - 11/10/2012
  * Prevent 'error' event from bubbling up due to no listeners [See #22]
  * Augment 'error' event emitter with an actual Error object [See #22]

# 0.4.3 - 10/02/2012
  * Allow a callback to be given to `patchGlobal()` [Fixes #19]
  * Removed old `patch_global()` alias

# 0.4.2 - 9/29/2012
  * Added test coverage to `patchGlobal()`
  * Quit using my own deprecated `get_ident()` method inside `patchGlobal`
  * Send string errors as a normal message to prevent Sentry server from crying [Fixes #18]

# 0.4.1 - 9/3/2012
 * patchGlobal() was actually broken. :( Thanks @ligthyear [Fixes #17]

# 0.4.0 - 8/14/2012
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
