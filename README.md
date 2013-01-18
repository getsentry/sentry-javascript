# Raven.js

This is a JavaScript client for the [Sentry][1] realtime event logging and
aggregation platform.

Raven.js v1.0 and above requires Sentry v5.1.5 or later. If you are running an
earlier version of Sentry, you should use Raven.js pre 1.0.

The stacktrace generation was inspired by the [javascript-stacktrace][4]
project, and includes heavily modified portions of that project's code. The
full and minified distribution files include [parseUri][5] and [TraceKit][6].

[1]: http://getsentry.com/
[4]: https://github.com/eriwen/javascript-stacktrace
[5]: http://blog.stevenlevithan.com/archives/parseuri
[6]: https://github.com/occ/TraceKit

## Install

Simply include the minified distribution file on your page:

```html
<script type="text/javascript" src="//d3nslu0hdya83q.cloudfront.net/dist/1.0-beta10/raven.min.js"></script>
```


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
Raven.config('http://public@example.com/project-id', {
    logger: "yoursite.errors.javascript"
});
```

**logger** - The logger name you wish to send with the message. Defaults to
'javascript'.

**site** - An optional site name to include with the message.

**ignoreErrors** - An array of error messages that should not get passed to
Sentry.

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

To install error capturing globally, you need to *install* Raven.

```javascript
Raven.install();
// or
Raven.config(...).install();
```

## Capturing authenticated users
```javascript
Raven.setUser({
    email: 'matt@example.com',
    id: '123'
})
```

`setUser` accepts an arbitrary object of data. The data is passed as-is.

If you need to unset the user object, you can just call `setUser` without an argument. This would be useful in a web app where the user is logging in/out without refreshing the page.

```javascript
Raven.setUser();
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
