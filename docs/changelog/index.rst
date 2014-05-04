Changelog
=========

1.1.15
~~~~~~
* Fix issues if a non-string were passed to `Raven.captureMessage` and non-Error objects were passed to `Raven.captureException`.

1.1.14
~~~~~~
* Only filter normal Error objects without a message, not all of them. Turns out, people throw errors like this. Ahem, Underscore.js. See: https://github.com/jashkenas/underscore/pull/1589/files

1.1.13
~~~~~~
* Fixed a unicode issue in the previous release.

1.1.12
~~~~~~
* Fix a bug using the ``console`` plugin with older IE. See: https://github.com/getsentry/raven-js/pull/192
* Added initial ``ember.js`` plugin for early testing and feedback.
* Added initial ``angular.js`` plugin for early testing and feedback.
* Fixed an issue with the ``require.js`` plugin basically not working at all. See: https://github.com/getsentry/raven-js/commit/c2a2e2672a2a61a5a07e88f24a9c885f6dba57ae
* Got rid of ``Raven.afterLoad`` and made it internal only.
* ``Raven.TraceKit`` is now internal only.
* Truncate message length to a max of 100 characters becasue angular.js sucks and generates stupidly large error messages.

1.1.11
~~~~~~
* Capture column number from FireFox
* Fix propagation of extra options through ``captureException``, see: https://github.com/getsentry/raven-js/pull/189
* Fix a minor bug that causes TraceKit to blow up of someone passes something dumb through ``window.onerror``

1.1.10
~~~~~~
* A falsey DSN value disables Raven without yelling about an invalid DSN.

1.1.9
~~~~~
* Added ``Raven.lastEventId()`` to get back the Sentry event id. See: http://raven-js.readthedocs.org/en/latest/usage/index.html#getting-back-an-event-id
* Fixed a bug in the ``console`` plugin. See: https://github.com/getsentry/raven-js/pull/181
* Provide a way out of deep wrapping arguments. See: https://github.com/getsentry/raven-js/pull/182
* ``Raven.uninstall()`` actually removes the patched ``window.onerror``.
* No more globally exposed ``TraceKit``!

1.1.8
~~~~~
* Fixed a bug in IE8. See: https://github.com/getsentry/raven-js/pull/179

1.1.4-1.1.7
~~~~~~~~~~~
These were a bunch of super small incremental updates trying to get better integration and better support inside Sentry itself.

* Culprit determined from the src url of the offending script, not the url of the page.
* Send Sentry the frames in the right order. They were being sent in reverse. Somehow nobody noticed this.
* Support for Chrome's new window.onerror api. See: https://github.com/getsentry/raven-js/issues/172

1.1.3
~~~~~
* When loading with an AMD loader present, do not automatically call ``Raven.noConflict()``. This was causing issues with using plugins. See: https://github.com/getsentry/raven-js/pull/165
* https://github.com/getsentry/raven-js/pull/168

1.1.2
~~~~~
* An invalid DSN will now raise a RavenConfigError instead of some cryptic error
* Will raise a RavenConfigError when supplying the private key part of the DSN since this isn't applicable for raven.js and is harmful to include
* https://github.com/getsentry/raven-js/issues/128

1.1.1
~~~~~
* Fixed a bug in parsing some DSNs. See: https://github.com/getsentry/raven-js/issues/160

1.1.0
~~~~~

Plugins
-------
If you're upgrading from 1.0.x, 2 "plugins" were included with the package. These 2 plugins are now stripped out of core and included as the ``jquery`` and ``native`` plugins. If you'd like to start using 1.1.0 and maintain existing functionality, you'll want to use: http://cdn.ravenjs.com/1.1.0/jquery,native/raven.min.js For a list of other plugins, checkout http://ravenjs.com

ravenjs.com
-----------
A new website dedicated to helping you compile a custom build of raven.js

whitelistUrls
-------------
``whitelistUrls`` are recommended over ``ignoreUrls``. ``whitelistUrls`` drastically helps cut out noisy error messages from other scripts running on your site.

Misc
----
* ``ignoreUrls``, ``ignoreErrors``, ``includePaths`` have all been unified to accept both a regular expression and strings to avoid confusion and backwards compatability
* ``Raven.wrap`` recursively wraps arguments
* Events are dispatched when an exception is received, recorded or failed sending to Sentry
* Support newer Sentry protocol which allows smaller packets
* Allow loading raven async with RavenConfig
* Entirely new build system with Grunt
* ``options.collectWindowErrors`` to tell Raven to ignore window.onerror
