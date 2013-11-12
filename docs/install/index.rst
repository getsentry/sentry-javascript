Installation
============

Raven is distributed in a few different methods, but they all should be included inside the ``<head>`` of your page.

You should try and include Raven as high up on the page as possible. Ideally, you'd like to include Raven first, in order to potentially catch errors from other JavaScript files.

Using our CDN
~~~~~~~~~~~~~

We serve our own builds off of `Fastly <http://www.fastly.com/>`_. They are accessible over both http and https, so we recommend leaving the protocol off.

Our CDN distributes builds with and without :doc:`plugins </plugins/index>`.

.. code-block:: html

    <script src="//cdn.ravenjs.com/1.1.0/raven.min.js"></script>

**We highly recommend trying out a plugin or two since it'll greatly improve the chances that we can collect good information.**

This version does not include any plugins. See `ravenjs.com <http://ravenjs.com/>`_ for more information about plugins and getting other builds.

Bower
~~~~~

We also provide a way to deploy Raven via `bower
<http://bower.io/>`_. Useful if you want serve your own scripts instead of depending on our CDN and mantain a ``bower.json`` with a list of dependencies and versions.

.. code-block:: sh

    $ bower install raven-js

.. code-block:: html

    <script src="/bower_components/raven-js/dist/raven.js"></script>

Also note that the file is uncompresed but is ready to pass to any decent JavaScript compressor like `uglify <https://github.com/mishoo/UglifyJS2>`_.

