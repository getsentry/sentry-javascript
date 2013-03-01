Installation
============

Raven is distributed in a few different methods, but they all should be included inside the ``<head>`` of your page.

You should try and include Raven as high up on the page as possible. Ideally, you'd like to include Raven first, in order to potentially catch errors from other JavaScript files.

Using our CDN
~~~~~~~~~~~~~

We serve our own builds off of Amazon CloudFront. They are accessible over both http and https, so we recommend leaving the protocol off.

Minor release with automatic bug fixes
--------------------------------------
This is the recommended method to maintain compatability and still receive minor bugfixes.

.. code-block:: html

    <script src="//d3nslu0hdya83q.cloudfront.net/dist/1.0/raven.min.js"></script>

``1.0`` will update for all ``1.0.x`` releases. ``1.1.0`` would not get automatically updated, for example.

Tagged version
--------------
Stick with a specific version to avoid any risk at all, but it's recommended to pay attention to updates frequently since new versions are released often.

.. code-block:: html

    <script src="//d3nslu0hdya83q.cloudfront.net/dist/1.0.7/raven.min.js"></script>

Bleeding Edge
-------------
If you're feeling adventurous, we also host a **master** build, which should be considered *potentially* unstable, but bleeding edge.

.. code-block:: html

    <script src="//d3nslu0hdya83q.cloudfront.net/builds/master/raven.min.js"></script>

CDNJS.com
~~~~~~~~~

`cdnjs.com <http://cdnjs.com>`_ hosts our **tagged versions** and gives us `SPDY <http://en.wikipedia.org/wiki/SPDY>`_ support! Again, just leave the protocol off, and it'll do it's magic.

.. code-block:: html

    <script src="//cdnjs.cloudflare.com/ajax/libs/raven.js/1.0.7/raven.min.js"></script>

.. Bower
   ~~~~~

   We also provide a way to deploy Raven via `bower
   <http://twitter.github.com/bower/>`_. Useful if you want serve your scripts    instead relying on CDNs and mantain a ``component.json`` with a list of    dependencies and versions.

   .. code-block:: sh

       bower install raven-js

   Please note that it automatically deploys the ``tracekit`` requirement and  you   should link it **before** ``raven-js``.

   .. code-block:: html

       <script src="/components/tracekit/tracekit.js"></script>
       <script src="/components/raven-js/src/raven.js"></script>

   Also note that both files are uncompresed but are ready to pass to any  decent   JavaScript compressor like `uglify
   <https://github.com/mishoo/UglifyJS2>`_ or `closure
   <https://developers.google.com/closure/>`_.

