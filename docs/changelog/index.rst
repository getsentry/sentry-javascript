Changelog
=========

1.1.0
~~~~~

Plugins
-------
If you're upgrading from 1.0.x, 2 "plugins" were included with the package. These 2 plugins are not stripped out of core and included as the ``jquery`` and ``native`` plugins. If you'd like to start using 1.1.0 and maintain existing functionality, you'll want to use: http://cdn.ravenjs.com/1.1.0/jquery,native/raven.min.js For a list of other plugins, checkout http://ravenjs.com

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
