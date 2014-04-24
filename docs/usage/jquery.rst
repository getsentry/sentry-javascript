jQuery
======

Automatically catching all AJAX errors
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Same Origin
-----------

Whenever an Ajax request completes with an error, jQuery triggers the ``ajaxError`` event, passing the ``event`` object, the
``jqXHR`` object (prior to jQuery 1.5, the ``XHR`` object), and the ``settings`` object that was used in the creation of the
request. When an HTTP error occurs, the fourth argument (``thrownError``) receives the textual portion of the HTTP status,
such as "Not Found" or "Internal Server Error."

You can use this event to globally handle Ajax errors:

.. code-block:: javascript

    $(document).ajaxError(function (event, jqXHR, ajaxSettings, thrownError) {
        Raven.captureMessage(
            thrownError || jqXHR.statusText,
            {
                extra: {
                    type: ajaxSettings.type,
                    url: ajaxSettings.url,
                    data: ajaxSettings.data,
                    status: jqXHR.status,
                    error: thrownError || jqXHR.statusText,
                    response: jqXHR.responseText.substring(0, 100)
                }
            }
        );
    });


**Note:**

* This handler is not called for cross-domain script and cross-domain JSONP requests.

* If ``$.ajax()`` or ``$.ajaxSetup()`` is called with the ``global`` option set to ``false``, the ``.ajaxError()`` method will not fire.

* As of jQuery 1.8, the ``.ajaxError()`` method should only be attached to document.


Cross Origin
------------

Due security reasons most web browsers are not giving permissions to access error messages for cross domain scripts. This is not jQuery issue but an overall javascript limitation.

When you control the backend
............................

If you have access to the backend system you are calling, you can set response headers to allow a cross domain call:

.. code-block:: yaml

    Access-Control-Allow-Origin: http://domain1.com, http://domain2.com'

Script tags have now got a new non-standard attribute called ``crossorigin`` (`read more <https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script#attr-crossorigin>`_). The most secure value for this would be ``anonymous``. So, you'll have to modify your script tags to look like the following:

.. code-block:: html

    <script src="http://sub.domain.com/script.js" crossorigin="anonymous"></script>

When you have no access to the backend
......................................

If you have no access to the backend, you could try a workaround, which is basically adding a timeout on the Ajax call. This is however very dirty, and will fail on slow connection or long response time:

.. code-block:: javascript

    $.ajax({
        url: 'http:/mysite/leaflet.js',
        success: function() { ... },
        error: function() { ... },
        timeout: 2000, // 2 seconds timeout before error function will be called
        dataType: 'script',
        crossDomain: true
    });

