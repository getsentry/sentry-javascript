# Raven.js

This is an experimental JavaScript client for the [Sentry][1] realtime event
logging and aggregation platform.

The stacktrace generation was inspired by the [javascript-stacktrace][4]
project, and includes heavily modified portions of that project's code. The
full and minified distribution files include [parseUri][5].

[1]: http://getsentry.com/
[4]: https://github.com/eriwen/javascript-stacktrace
[5]: http://blog.stevenlevithan.com/archives/parseuri


## Install

Download the latest version [here][5].

Raven.js requires either [jQuery][6] (>1.5) or [Zepto.js][7].

First include jQuery or Zepto in your document's head. Then include the
minified distribution file from the 'dist' directory:

    <script type="text/javascript" src="js/jquery.js"></script>
    <script type="text/javascript" src="js/raven-0.3.min.js"></script>

[5]: https://github.com/downloads/lincolnloop/raven-js/raven-js-0.3.tar.gz
[6]: http://jquery.com/
[7]: http://zeptojs.com/


## Configuration

Configure the client by passing the DSN as the first argument:

    Raven.config('http://secret:public@example.com/project-id');

Or if you need to specify additional options:

    Raven.config({
        "publicKey": "e89652ec30b94d9db6ea6f28580ab499",
        "servers": ["http://your.sentryserver.com/api/store/"],
        "projectId": "project-id",
        "logger": "yoursite.errors.javascript"
    });

**publicKey** - This is only needed if you're using project auth, and it should
be the desired user's public key.

**servers** - (*required*) An array of servers to send exception info to.

**projectId** - The id of the project to log the exception to. Defaults to '1'.

**logger** - The logger name you wish to send with the message. Defaults to
'javascript'.

**site** - An optional site name to include with the message.

**fetchHeaders** - Generate a HEAD request to gather header information to send
with the message. This defaults to 'false' because it doesn't work on
cross-domain requests.

**signatureUrl** - Use a server side url to get a signature for the message.
See below in the "Security" section for more details.


## Logging Errors

You can manually log errors like this:

    try {
        errorThrowingCode();
    } catch(err) {
        Raven.captureException(err);
        // Handle error...
    }

On browsers that support it, you can attach the `Raven.process` method directly
to the `window.onerror` attribute:

    window.onerror = Raven.process;

This should be harmless on browsers that don't support window.onerror, and in
those cases it will simply do nothing.

## Security

Raven requires you to set up the CORS headers within Sentry. These headers should include
the base URI of which you plan to send events from.

For example, if you are using raven-js on http://example.com, you should list <code>http://example.com</code>
in your origins configuration. If you only wanted to allow events from /foo, set the value to <code>http://example.com/foo</code>.

## Support

 * [Bug Tracker](https://github.com/lincolnloop/raven-js/issues)
 * [IRC](irc://chat.freenode.net/sentry) (chat.freenode.net, #sentry)
