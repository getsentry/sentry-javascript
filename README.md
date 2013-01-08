# Raven.js

[![Build Status](https://secure.travis-ci.org/getsentry/raven-js.png?branch=master)](https://secure.travis-ci.org/getsentry/raven-js/builds)

This is a JavaScript client for the [Sentry][1] realtime event logging and
aggregation platform.

Raven.js v0.4 and above requires Sentry v4.1 or later. If you are running an
earlier version of Sentry, you should use Raven.js v0.3.

The stacktrace generation was inspired by the [javascript-stacktrace][4]
project, and includes heavily modified portions of that project's code. The
full and minified distribution files include [parseUri][5].

[1]: http://getsentry.com/
[4]: https://github.com/eriwen/javascript-stacktrace
[5]: http://blog.stevenlevithan.com/archives/parseuri

## Install

Download the latest version [here][5].


Simply include the minified distribution file from the 'dist' directory:

```html
<script type="text/javascript" src="js/raven-0.7.1.min.js"></script>
```

[5]: https://github.com/downloads/getsentry/raven-js/raven-js-0.7.1.tar.gz


## Configuration

First, you will need to configure Sentry to allow requests from the domain name
that is hosting your JavaScript. Go to *Account &rarr; Projects* and select
the project you want to configure. Under "Client Security", list the domains
you want to access Sentry from.

>![Client Security](http://f.cl.ly/items/1t2A33243O2V1U160C39/client-security.png)

Next, configure the client by passing the DSN as the first argument:

```javascript
Raven.config('http://public@example.com/project-id');
```

Or if you need to specify additional options:

```javascript
Raven.config({
    "publicKey": "e89652ec30b94d9db6ea6f28580ab499",
    "servers": ["http://your.sentryserver.com/"],
    "projectId": "project-id",
    "logger": "yoursite.errors.javascript"
});
```

**publicKey** - The desired user's public key.

**servers** - (*required*) An array of servers to send exception info to. This
should be just the base URL. For example, if your API store URL is
"http://mysentry.com/api/4/store/", then the base URL is "http://mysentry.com/"
and the projectId is 4. This is a **backwards-incompatible** change introduced
in v0.5.

**projectId** - The id of the project to log the exception to. Defaults to '1'.

**logger** - The logger name you wish to send with the message. Defaults to
'javascript'.

**site** - An optional site name to include with the message.

**dataCallback** - An optional callback to add special parameters on data before sending to Sentry

```javascript
Raven.config({
    // options...
    dataCallback: function (data) {
        data['sentry.interfaces.User'] = {
            is_authenticated: true,
            id: 1,
            username: 'Foo',
            email: 'Bar'
        };
        return data;
    }
}];
```

**fetchHeaders** - Generate a HEAD request to gather header information to send
with the message. This defaults to 'false' because it doesn't work on
cross-domain requests.

**signatureUrl** - Use a server side url to get a signature for the message.
See below in the "Security" section for more details.

**ignoreErrors** - An array of error messages that should not get passed to
Sentry. You'll probably want to set this to `["Script error."]`.

**ignoreUrls** - An array of regular expressions matching urls which will not
get passed to Sentry. For example, you could set it to
`[/ajax\.googleapis\.com\/ajax\/libs\/jquery/i]` to ignore errors from the
Google Hosted jQuery library.

## Logging Errors

You can manually log errors like this:

```javascript
try {
    errorThrowingCode();
} catch(err) {
    Raven.captureException(err);
    // Handle error...
}
```

On browsers that support it, you can attach the `Raven.process` method directly
to the `window.onerror` attribute:

```javascript
window.onerror = Raven.process;
```

This should be harmless on browsers that don't support window.onerror, and in
those cases it will simply do nothing.

### Recording errors before Raven has loaded

If your application loads a significant amount of JavaScript you may want to record errors which
occur before the raven JavaScript has loaded, especially as this allows you to avoid the raven.js
request temporarily delaying a user-visible resource.

This example installs a primitive error handler as early as possible — typically a `<script>` in
the HTML `<head>` — which will be replaced as soon as Raven loads:

```html
<html>
    <head>
        <script>
            var _ravenQueue = [];
            window.onerror = function(message, file, lineNumber) {
               var msg = lineNumber ? message + " at " + lineNumber : message;
               _ravenQueue.push({message: msg, culprit: file});
            }
        </script>
    </head>
    <body>
        …
        <script src="{% static "external/raven-0.7.1.min.js" %}"></script>
        <script>
            Raven.config("{{ RAVEN_DSN|safe }}");
            window.onerror = Raven.process;
            for (var i = 0; i < _ravenQueue.length; i++) {
                Raven.send(_ravenQueue[i]);
            };
        </script>
    </body>
</html>
```


## Passing additional data

The captureException and captureMessage functions allow an additional options argument which
you can use to pass various data (such as ``tags``):

```javascript
Raven.captureMessage('My error', {
    tags: {key: "value"}
});
```

## Security

Raven requires you to set up the CORS headers within Sentry. These headers
should include the base URI of which you plan to send events from.

For example, if you are using raven-js on http://example.com, you should list
<code>http://example.com</code> in your origins configuration. If you only
wanted to allow events from /foo, set the value to
<code>http://example.com/foo</code>.

## Support

 * [Bug Tracker](https://github.com/getsentry/raven-js/issues)
 * [IRC](irc://chat.freenode.net/sentry) (chat.freenode.net, #sentry)
