Pro Tips™
=========

Decluttering Sentry
~~~~~~~~~~~~~~~~~~~

The community has compiled a list of common ignore rules for common things, like Facebook, Chrome extensions, etc. So it's recommended to at least check these out and see if they apply to you. `Check out the original gist <https://gist.github.com/impressiver/5092952>`_.

See also: :ref:`Config: whitelistUrls<config-whitelist-urls>`

.. code-block:: javascript

    var ravenOptions = {
        ignoreErrors: [
          // Random plugins/extensions
          'top.GLOBALS',
          // See: http://blog.errorception.com/2012/03/tale-of-unfindable-js-error. html
          'originalCreateNotification',
          'canvas.contentDocument',
          'MyApp_RemoveAllHighlights',
          'http://tt.epicplay.com',
          'Can\'t find variable: ZiteReader',
          'jigsaw is not defined',
          'ComboSearch is not defined',
          'http://loading.retry.widdit.com/',
          'atomicFindClose',
          // Facebook borked
          'fb_xd_fragment',
          // ISP "optimizing" proxy - `Cache-Control: no-transform` seems to reduce this. (thanks @acdha)
          // See http://stackoverflow.com/questions/4113268/how-to-stop-javascript-injection-from-vodafone-proxy
          'bmi_SafeAddOnload',
          'EBCallBackMessageReceived',
          // See http://toolbar.conduit.com/Developer/HtmlAndGadget/Methods/JSInjection.aspx
          'conduitPage'
        ],
        ignoreUrls: [
          // Facebook flakiness
          /graph\.facebook\.com/i,
          // Facebook blocked
          /connect\.facebook\.net\/en_US\/all\.js/i,
          // Woopra flakiness
          /eatdifferent\.com\.woopra-ns\.com/i,
          /static\.woopra\.com\/js\/woopra\.js/i,
          // Chrome extensions
          /extensions\//i,
          /^chrome:\/\//i,
          // Other plugins
          /127\.0\.0\.1:4001\/isrunning/i,  // Cacaoweb
          /webappstoolbarba\.texthelp\.com\//i,
          /metrics\.itunes\.apple\.com\.edgesuite\.net\//i
        ]
    };

External / CDN Scripts
~~~~~~~~~~~~~~~~~~~~~~

In many browsers, Raven.js will be prevented from reporting errors in scripts that are loaded from a different domain, e.g.: scripts loaded from a CDN or subdomain. This is for security reasons: to stop any information leaking across domain boundaries.

One basic workaround to this is to either not host your javascript files on an external domain, or to proxy externally hosted scripts through your domain. However, this rather negates the value of using a CDN.

The "real" solution is to enable `Cross Origin Resource Sharing <https://developer.mozilla.org/en-US/docs/HTTP/Access_control_CORS>`_ (CORS) on your CDN / static file server and to add the ``crossorigin="anonymous"`` attribute to your script tags, e.g.::

    <script type="text/javascript" crossorigin="anonymous"
        src="my-cors-enabled-bucket.s3.com/foo.js">
    </script>

For more info, see `enable-cors.org <http://enable-cors.org>`_ and Amazon S3's `CORS documentation <http://docs.aws.amazon.com/AmazonS3/latest/dev/cors.html>`_.
