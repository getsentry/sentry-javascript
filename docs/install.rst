Installation
============

Raven is distributed in a few different methods, and should get included
after any other libraries are included, but before your own scripts.

So for example:

.. sourcecode:: html

  <script src="jquery.js"></script>
  <script src="https://cdn.ravenjs.com/###RAVEN_VERSION###/raven.min.js" crossorigin="anonymous"></script>
  <script>Raven.config('___PUBLIC_DSN___').install();</script>
  <script src="app.js"></script>

This allows the ability for Raven's integrations to instrument themselves. If
included before something like Angular, it'd be impossible to use for
example, the Angular plugin.

Using our CDN
~~~~~~~~~~~~~

We serve our own builds off of `Fastly <http://www.fastly.com/>`_. They
are accessible over both http and https, so we recommend leaving the
protocol off.

Our CDN distributes builds with and without :doc:`integrations <integrations/index>`.

.. sourcecode:: html

  <script src="https://cdn.ravenjs.com/###RAVEN_VERSION###/raven.min.js" crossorigin="anonymous"></script>

This version does not include any plugins. See `ravenjs.com
<http://ravenjs.com/>`_ for more information about plugins and getting
other builds.

Bower
~~~~~

We also provide a way to deploy Raven via `bower
<http://bower.io/>`_. Useful if you want serve your own scripts instead of
depending on our CDN and mantain a ``bower.json`` with a list of
dependencies and versions (adding the ``--save`` flag would automatically
add it to ``bower.json``).

.. code-block:: sh

  $ bower install raven-js --save

.. code-block:: html

  <script src="/bower_components/raven-js/dist/raven.js"></script>

Also note that the file is uncompresed but is ready to pass to any decent
JavaScript compressor like `UglifyJS
<https://github.com/mishoo/UglifyJS2>`_.

npm
~~~

Raven is also available as an npm package, `raven-js
<https://www.npmjs.com/package/raven-js>`_.

.. code-block:: sh

  $ npm install raven-js --save

.. code-block:: html

	<script src="/node_modules/raven-js/dist/raven.js"></script>

Note that if you intend to use Raven with Node, `raven-node <https://github.com/getsentry/raven-node>`_ is the client to use.


CommonJS
~~~~~~~~

To use Raven with CommonJS imports:

.. code-block:: javascript

	var Raven = require('raven-js')	;
	Raven
	    .config('___PUBLIC_DSN___')
	    .install();

ES2015 (ES6)
~~~~~~~~~~~~

To use Raven with ES2015 (ES6) imports:

.. code-block:: javascript

	import Raven from 'raven-js';
	Raven
	    .config('___PUBLIC_DSN___')
	    .install();

Async Loading
~~~~~~~~~~~~~

To load Sentry JS SDK asynchronously, you need to do two things.

Provide global ``SENTRY_SDK`` variable with SDK's URL (for example from our CDN), your DSN and SDK's configuration.
And place the snippet below as soon as possible in your HTML code. For example:

.. code-block:: html

  <script>
    window.SENTRY_SDK = {
      url: 'https://cdn.ravenjs.com/###RAVEN_VERSION###/raven.min.js',
      dsn: '___PUBLIC_DSN___',
      options: {
        release: '1.3.0'
      }
    }

    ;(function(a,b,g,e,h){var k=a.SENTRY_SDK,f=function(a){f.data.push(a)};f.data=[];var l=a[e];a[e]=function(c,b,e,d,h){f({e:[].slice.call(arguments)});l&&l.apply(a,arguments)};var m=a[h];a[h]=function(c){f({p:c.reason});m&&m.apply(a,arguments)};var n=b.getElementsByTagName(g)[0];b=b.createElement(g);b.src=k.url;b.crossorigin="anonymous";b.addEventListener("load",function(){try{a[e]=l;a[h]=m;var c=f.data,b=a.Raven;b.config(k.dsn,k.options).install();var g=a[e];if(c.length)for(var d=0;d<c.length;d++)c[d].e?g.apply(b.TraceKit,c[d].e):c[d].p&&b.captureException(c[d].p)}catch(p){console.log(p)}});n.parentNode.insertBefore(b,n)})(window,document,"script","onerror","onunhandledrejection");
  </script>

Or you can place those two things in a separate script tags. This will queue all errors (and promises if the environment supports ``unhandledrejection`` handler) that happened before SDK was loaded and send them once it's configured and installed.

Be aware however, that there are some trade-offs to this solution, as errors might provide less information due to them being "retriggered" instead of being caught from the original source.

NOTE: This won't work when opening ``index.html`` or any other html file from the file system, as it doesn't support anonymous cross-origin scripts.
The same thing can happen for any cross-origin scripts as well. To read more about it, see `What the heck is "Script error"?<https://blog.sentry.io/2016/05/17/what-is-script-error>`_.

To read un-minified source code for this loader, see `loader.js<https://github.com/getsentry/raven-js/blob/master/src/loader.js>`_

Requirements
~~~~~~~~~~~~

Raven supports IE8+ and all other modern browsers, and works in Web Workers.

Raven requires the browser JavaScript environment to provide:

- Either `XHR Level 2 <http://caniuse.com/#feat=xhr2>`_ (IE10+, all other modern browsers)
  or `XDomainRequest <https://developer.mozilla.org/en-US/docs/Web/API/XDomainRequest>`_ (IE8, IE9)
- A global ``JSON`` object with ``JSON.stringify`` (IE8+ `standards mode
  <http://msdn.microsoft.com/en-us/library/cc288325(VS.85).aspx>`_, all other modern browsers)

Raven does not support IE 7 or other older browsers which do not provide the required features listed above.
On those older browsers, Raven.js is designed to fail gracefully; including it on your page
will have no effect, but it won't collect and report uncaught exceptions.
