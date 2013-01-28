Contributing
============

Setting up an Environment
~~~~~~~~~~~~~~~~~~~~~~~~~

To run the test suite and run our code linter, node.js and npm are required. If you don't have node installed, `get it here <http://nodejs.org/download/>`_ first.

Installing all other dependencies is as simple as:

::

    make develop

Running the Test Suite
~~~~~~~~~~~~~~~~~~~~~~

The test suite is powered by `Mocha <http://visionmedia.github.com/mocha/>`_ and can both run from the command line, or in the browser.

From the command line:

::

    make test

From your browser:

::

    make runserver

Then visit: http://localhost:8888/test/test.html

Contributing Back Code
~~~~~~~~~~~~~~~~~~~~~~

Please, send over suggestions and bug fixes in the form of pull requests on `GitHub <https://github.com/getsenty/raven-js>`_. Any fixes/features should include tests.
