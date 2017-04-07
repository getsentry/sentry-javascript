# 1.1.6, 1.2.1 - 4/7/2017
- Fix memory leak in `consoleAlert` (and thus, if not disabled, in `captureException`) [See #300]

# 1.2.0 - 3/16/2017
- Add sampleRate config option [See #292]

# 1.1.5 - 3/16/2017
- Fix memory leak in http autoBreadcrumb instrumentation [See #296]

# 1.1.4 - 3/6/2017
- Use `util.format` to get message string in `console` instrumentation [See #289]

# 1.1.3 - 2/27/2017
- Add `parseUser` option to control user parsing behavior [See #274]
- Make http instrumentation use `req.emit` instead of response event handler [See #276]
- Add alert about raven-node vs raven-js when it seems like a browser env [See #277]

# 1.1.2 - 2/8/2017
- Send kwargs to `shouldSendCallback` [See #251]
- Capture breadcrumbs from global context [See #267]
- Make stack parsing native-frame-check work on Windows paths [See #268]
- Bind req/res to context domain in express requestHandler [See #269]
- Fix postgres/pg name mismatch [See #270]

# 1.1.1 and 1.0.1 - 12/13/2016
- Fix middleware backwards compatibility [See #246]

# 1.1.0 - 12/12/2016
- Added support for (automatic) breadcrumbs [See #240]
  - `Raven.captureBreadcrumb` manual method
  - `autoBreadcrumbs` config field to automatically capture breadcrumbs for:
    - console logs
    - http requests
    - postgres queries
- Deprecate `captureQuery` [See #239]

# 1.0.0 - 12/12/2016
- `Raven.config(...)` instead of `new raven.Client(...)`
- `Raven.install()` instead of `client.patchGlobal()`
- The callback to `Raven.captureException` now fires after transmission [See #217]
- Added `captureUnhandledRejections` option for Promise rejections
- Introduced contexts and associated `set/merge/getContext` methods [See #207]
- Added `shouldSendCallback` config option and `set*Callback` methods [See #220]
- Added `intercept()` method [See #225]
- Backwards compatibility was mostly maintained, but lots of stuff was deprecated
  - We'll print console messages if you're doing anything the old way
  - We'll also print console messages in certain situations where behavior might be surprising, like if no DSN is configured
  - You can disable these alerts with `Raven.disableConsoleAlerts();`

# 0.12.3 - 11/21/2016
 * Replace `node-uuid` dependency with `uuid` [See #236]

# 0.12.2 - 11/17/2016
 * Add column number to stack frames [See #235]
 * Check that `require.main.filename` is defined [See #233]

# 0.12.1 - 8/4/2016
 * Fix bug where `environment` option was not actually being transmitted to Sentry [See #185]

# 0.12.0 - 8/1/2016
 * Add `environment` config option and `setRelease` method [See #179]
 * No longer passes `process.env` values [See #181]
 * Connect/Express middleware now attempts to attach `req.user` as User interface [See #177]
 * Use json-stringify-safe to prevent circular refs [See #182]

# 0.11.0 - 5/5/2016
 * `captureError` renamed to `captureException` to match raven-js (alias exists for backwards compat)
 * `parsers.parseError` now coerces Error type to string. [See #155]

# 0.10.0 - 1/24/2016
 * Now supports global context for extra data, tags, user [See #141]
 * Added `setUserContext`, `setExtraContext`, `setTagsContext`

# 0.9.0 - 11/23/2015
 * Always coerce req.body to string. [See 2061d4efbf269c5e2096f2b7b55f5af2249c4aa7]
 * Allow passing options to HTTP transports. [See #123]
 * Fixed tests for node 4.0/5.0
 * Don't send a body for GET/HEAD requests unless one has been passed. [See 0476a6e9818135b8b258b0be0724c369fe30e3c7]

# 0.8.1 - 06/15/2015
 * Fixed a missing `domain` import in the Express/Connect middleware [See #120]

# 0.8.0 - 06/15/2015
 * Drop support for node 0.6
 * Remove `SENTRY_SITE` environment variable usage
 * Fixed `express deprecated req.host: Use req.hostname instead` warning [See #101]
 * Allow passing custom `ca` options for an https request [See #110 #108]
 * Use newer API endpoint [See #105]
 * Added support for Sentry's new Releases feature
 * Update Express/Connect middleware to support domains [See #116]

# 0.7.3 - 03/05/2015
 * When calling `captureError` without an Error, generate a fake `Error` object to pull stacktrace from. [See #87]
 * Prevent `patchGlobal` from causing recursion [See #84]
 * Fixed issues arond capturing tags.
 * Removed deprecated `site` parameter.
 * Allow explicitly declaring the `culprit` [See #107]
 * Publicly export out the various parsers [See #111]
 * Support for iojs and node 0.12

# 0.7.2 - 09/09/2014
 * Added `dataCallback` option to Client configuration. See: https://github.com/getsentry/raven-node#pre-processing-data

# 0.7.1 - 08/24/2014
 * Fixed package.json to not install junk from `optionalDependencies`. TIL `optionalDependencies` are still installed. [See #89]

# 0.7.0 - 06/24/2014
 * Moved from mattrobenolt/raven-node into getsentry/raven-node
 * Bumped to sentry protocol version 5
 * Capture all properties off of an Error object and send them along as as `extra` [See #72]
 * Better feature detection support for capturing request parameters. Adds support for use in Koa. [See #78 #79]

# 0.6.3 - 04/02/2014
 * Fix another issue that was breaking when running Raven from the REPL [See #66]
 * Add additional meta data on the error callbacks [See #67 #73]

# 0.6.2 - 02/14/2014
 * Allow overriding the logger name for an individual event
 * Update lsmod to not break when running Raven from the REPL
 * Added a `raven` bin so you can run `raven test [DSN]`

# 0.6.1 - 01/23/2014
  * Use lsmod for getting the list of installed modules [See #55]
  * Parse cookies on the http request always [See #56]
  * Use `stack-trace` to assist in capturing stacks. This should fix compat with the New Relic plugin [See #57]

# 0.6.0 - 11/9/2013
  * Updated sentry protocol to version 4 (Requires Sentry 6.0+ now)
  * Module names now include the full path
  * Attach client IP address to env object

# 0.5.6 - 11/8/2013
  * Include module and function name in stacktrace culprit

# 0.5.5 - 11/8/2013
  * Only record exceptions for 500 status codes from Connect middleware

# 0.5.4 - 10/13/2013
  * Fix DSN parser when using Sentry at a non-root URL, thanks @rcoup [See #44]

# 0.5.3 - 10/4/2013
  * Bump raw-stacktrace version

# 0.5.2 - 9/10/2013
  * Fix compatibilities with CoffeeScript [Fixes #47] [Fixes #50]
  * Doesnt chose on circular references

# 0.5.1 - 5/1/2013
  * Add support for third party transports, thanks @crankycoder

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
