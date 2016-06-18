import Raven, {RavenOptions} from '..';

Raven.config('https://public@getsentry.com/1').install();

// Test regex options
var options: RavenOptions = {
    logger: 'my-logger',
    ignoreUrls: [
        /graph\.facebook\.com/i
    ],
    ignoreErrors: [
        /fb_xd_fragment/
    ],
    includePaths: [
        /https?:\/\/(www\.)?getsentry\.com/,
        /https?:\/\/d3nslu0hdya83q\.cloudfront\.net/
    ],
    whitelistUrls: [
        /https?:\/\/google\.com/
    ]
};

// Test string params
options = {
    ignoreUrls: [
        'graph.facebook.com'
    ],
    ignoreErrors: [
        'fb_xd_fragment'
    ],
    includePaths: [
        'https://www.getsentry.com'
    ],
    whitelistUrls: [
        'https://www.google.com'
    ]
};

Raven.config('https://public@getsentry.com/1', 1).install();

var throwsError = () => {
    throw new Error('broken');
};

try {
    throwsError();
} catch(e) {
    Raven.captureException(e);
    Raven.captureException(e, {tags: { key: "value" }});
}

Raven.context(throwsError);
Raven.context({tags: { key: "value" }}, throwsError);

setTimeout(Raven.wrap(throwsError), 1000);
Raven.wrap({logger: "my.module"}, throwsError)();

Raven.setUserContext({
    email: 'matt@example.com',
    id: '123'
});

Raven.captureMessage('Broken!');
Raven.captureMessage('Broken!', {tags: { key: "value" }});
