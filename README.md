# Raven.js

This is an experimental JavaScript client for the [Sentry][1] realtime event
logging and aggregation platform.

[1]: http://getsentry.com/


## Install

Raven.js has a few requirements:

 * Either [jQuery][2] (>1.5) or [Zepto.js][3].
 * base64_encode from [php.js][4] (included in the vendor folder)
 * crypto-sha1-hmac from [Crypto-JS][5] (included in the vendor folder)

Include Raven and the requirements in your document's head:

    <script type="text/javascript" src="js/raven.js"></script>
    <script type="text/javascript" src="js/vendor/base64_encode.min.js"></script>
    <script type="text/javascript" src="js/vendor/crypto-sha1-hmac.min.js"></script>

[2]: http://jquery.com/
[3]: http://zeptojs.com/
[4]: http://phpjs.org/
[5]: http://code.google.com/p/crypto-js/


## Configuration

Configure the client like this:

    Raven.config({
        secretKey: '77ec8c99a8854256aa68ccb91dd9119d',
        publicKey: 'e89652ec30b94d9db6ea6f28580ab499',
        servers: ['http://your.sentryserver.com/api/store/'],
        projectId: 1,
        logger: 'yoursite.errors.javascript'
    });

**secretKey** - (*required*) If you're using project auth, this should be the
desired user's secret key. Otherwise, this should be the global superuser key.

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

## Support

 * [Bug Tracker](https://github.com/lincolnloop/raven-js/issues)
 * [IRC](irc://chat.freenode.net/sentry) (chat.freenode.net, #sentry)
