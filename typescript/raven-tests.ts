import Raven, {RavenOutgoingData} from "./raven"

// configuring:
Raven.config('https://public@getsentry.com/1').install();

Raven.config(
    'https://public@getsentry.com/1', 
    {
        logger: 'my-logger',
        ignoreUrls: [
            /graph\.facebook\.com/i
        ],
        ignoreErrors: [
            'fb_xd_fragment'
        ],
        includePaths: [
            /https?:\/\/(www\.)?getsentry\.com/,
            /https?:\/\/d3nslu0hdya83q\.cloudfront\.net/
        ]
    }
).install();

Raven.setDataCallback((data: RavenOutgoingData) => {return data});
Raven.setDataCallback(function (data: RavenOutgoingData, original: string) {return data});

Raven.setShouldSendCallback((data: RavenOutgoingData)  => {return data});
Raven.setShouldSendCallback(function (data: RavenOutgoingData, original: string) {return data});


// context:
Raven.context(throwsError);
Raven.context({tags: { key: "value" }}, throwsError);
Raven.context({extra: {planet: {name: 'Earth'}}}, throwsError);

Raven.setUserContext({
    email: 'matt@example.com',
    id: '123'
});

Raven.setExtraContext({foo: 'bar'});

Raven.setTagsContext({env: 'prod'});

Raven.clearContext();

var obj:Object = Raven.getContext();

Raven.setRelease('abc123');
Raven.setEnvironment('production');

setTimeout(Raven.wrap(throwsError), 1000);
Raven.wrap({logger: "my.module"}, throwsError)();
Raven.wrap({tags: {git_commit: 'c0deb10c4'}}, throwsError)();


// reporting:
var throwsError = () => {
    throw new Error('broken');
};

try {
    throwsError();
} catch(e) {
    Raven.captureException(e);
    Raven.captureException(e, {tags: { key: "value" }});
}

Raven.captureMessage('Broken!');
Raven.captureMessage('Broken!', {tags: { key: "value" }});
Raven.captureMessage('Broken!', { stacktrace: true });

Raven.showReportDialog({
    eventId: 0815,
    dsn:'1337asdf',
    user: {
        name: 'DefenitelyTyped',
        email: 'df@ts.ms'
    }
});


var err:Error = Raven.lastException();
