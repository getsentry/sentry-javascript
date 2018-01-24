import Raven = require('..'); // or import * as Raven from '..'

Raven.config('https://public@sentry.io/1').install();

var options: Raven.RavenOptions = {
    logger: 'my-logger',
    ignoreUrls: [
        /graph\.facebook\.com/i,
        'graph.facebook.com'
    ],
    ignoreErrors: [
        /fb_xd_fragment/,
        'fb_xd_fragment'
    ],
    includePaths: [
        /https?:\/\/(www\.)?getsentry\.com/,
        'https://www.sentry.io'
    ],
    whitelistUrls: [
        /https?:\/\/google\.com/,
        'https://www.google.com'
    ],
    autoBreadcrumbs: {
        xhr: false,
        console: false,
        dom: true,
        location: false,
        sentry: true
    },
    breadcrumbCallback: function (data) {
        return data
    }
};

Raven.config('https://public@sentry.io/1', options).install();

var throwsError = () => {
    throw new Error('broken');
};

try {
    throwsError();
} catch(e) {
    Raven.captureException(e);
    Raven.captureException(e, {tags: { key: "value" }});
}

// ErrorEvent requires at least Typescript 2.3.0 due to incorrect ErrorEvent definitions
// prior to that version.
var throwsErrorEvent = () => {
    throw new ErrorEvent('oops', {error: new Error('Oops')});
};

try {
    throwsErrorEvent();
} catch(ee) {
    Raven.captureException(ee);
    Raven.captureException(ee, {tags: { key: "value" }});
}

Raven.captureException('Something broke');
Raven.captureException('Something broke', {tags: { key: "value" }});

Raven.context(throwsError);
Raven.context({tags: { key: "value" }}, throwsError);
Raven.context(throwsErrorEvent);
Raven.context({tags: { key: "value" }}, throwsErrorEvent);

setTimeout(Raven.wrap(throwsError), 1000);
Raven.wrap({logger: "my.module"}, throwsError)();
Raven.wrap(throwsErrorEvent)();
Raven.wrap({logger: "my.module"}, throwsErrorEvent)();

Raven.setUserContext();
Raven.setUserContext({
    email: 'matt@example.com',
    id: '123'
});

Raven.setExtraContext({foo: 'bar'});
Raven.setExtraContext();
Raven.setTagsContext({env: 'prod'});
Raven.setTagsContext();
Raven.clearContext();
var obj:Object = Raven.getContext();
var err:Error = Raven.lastException();

Raven.captureMessage('Broken!');
Raven.captureMessage('Broken!', {tags: { key: "value" }});
Raven.captureMessage('Broken!', { stacktrace: true });
Raven.captureMessage('Warning', { level: 'warning' });
Raven.captureBreadcrumb({
    message: "This is a breadcrumb message."
});
Raven.captureBreadcrumb({category: "console", level: "log", message: "A console.log() message"});

Raven.setRelease('abc123');
Raven.setEnvironment('production');

Raven.setDataCallback(function (data: any) {});
Raven.setDataCallback(function (data: any, original: any) {});
Raven.setShouldSendCallback(function (data: any) {});
Raven.setShouldSendCallback(function (data: any, original: any) {});

Raven.showReportDialog({
    eventId: 'abcdef123456'
});

Raven.setDSN('https://public@sentry.io/2');
