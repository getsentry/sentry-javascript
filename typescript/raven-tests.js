"use strict";
var __1 = require('..');
__1["default"].config('https://public@getsentry.com/1').install();
var options = {
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
};
__1["default"].config('https://public@getsentry.com/1', 1).install();
var throwsError = function () {
    throw new Error('broken');
};
try {
    throwsError();
}
catch (e) {
    __1["default"].captureException(e);
    __1["default"].captureException(e, { tags: { key: "value" } });
}
__1["default"].context(throwsError);
__1["default"].context({ tags: { key: "value" } }, throwsError);
setTimeout(__1["default"].wrap(throwsError), 1000);
__1["default"].wrap({ logger: "my.module" }, throwsError)();
__1["default"].setUserContext({
    email: 'matt@example.com',
    id: '123'
});
__1["default"].captureMessage('Broken!');
__1["default"].captureMessage('Broken!', { tags: { key: "value" } });
