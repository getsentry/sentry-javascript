Raven Test Kit
==============

When building tests for your application, you want to assert that the right flow-tracking or error is being sent to *Sentry*,
**but** without really sending it to the *Sentry* system.
This way you won't swamp it with false reports during test running and other CI operations.

`Raven Test Kit <https://github.com/wix/raven-testkit>`_ enables Raven to work natively in your application,
but it overrides the default Raven transport mechanism so the report is not really sent but rather logged locally.
In this way, the logged reports can be fetched later for usage verification or other uses you may have in your testing environment.

Installation
------------

.. code-block:: sh

  $ npm install raven-testkit --save-dev

How to Use
----------
CommonJS
~~~~~~~~

To use Raven with CommonJS imports:

.. code-block:: javascript

	var testKitInitializer = require('raven-testkit')


ES2015 (ES6)
~~~~~~~~~~~~

To use Raven with ES2015 (ES6) imports:

.. code-block:: javascript

	import testKitInitializer from 'raven-testkit'


Then you may create a `testkit` instance and validate your reports against it as follows:

.. code-block:: javascript

  const testKit = testKitInitializer(Raven)

  // any scenario that should call Raven.catchException(...)

  expect(testKit.reports()).to.have.lengthOf(1)
  const report = testKit.reports()[0]
  expect(report).to.have.property('release').to.equal('test')


Additionally, you may pass your own `shouldSendCallback` logic

.. code-block:: javascript

  const shouldSendCallback = data => {
      return /* your own logic */
  }
  const testKit = testKitInitializer(Raven, shouldSendCallback)


Other useful API, more example usage and updates can be found in `raven-testkit <https://github.com/wix/raven-testkit>`_
