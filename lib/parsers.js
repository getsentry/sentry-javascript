var utils = require('./utils');
var url = require('url');

module.exports.parseText = function parseText(message, kwargs) {
    kwargs = kwargs || {};
    kwargs['message'] = message;
    return kwargs;
};

module.exports.parseError = function parseError(err, structuredStackTrace) {
    utils.parseStack(structuredStackTrace, function(frames) {
        err.raven.kwargs['message'] = err.name + ': ' + (err.message || '<no message>');
        err.raven.kwargs['sentry.interfaces.Exception'] = {
            type: err.name,
            value:err.message
        };

        err.raven.kwargs['sentry.interfaces.Stacktrace'] = {frames: frames};

        err.raven.cb(err.raven.kwargs);
    });
};

module.exports.parseQuery = function parseQuery(query, engine, kwargs) {
    kwargs = kwargs || {};
    kwargs['message'] = query;
    kwargs['sentry.interfaces.Query'] = {
        query: query,
        engine: engine
    };
    return kwargs;
};

module.exports.parseRequest = function parseRequest(req, kwargs) {
    kwargs = kwargs || {};
    kwargs['sentry.interfaces.Http'] = {
        method: req.method,
        query_string: url.parse(req.url).query,
        headers: req.headers,
        cookies: req.cookies || '<unavailable: use cookieParser middleware>',
        data: req.body || '<unavailable: use bodyParser middleware>',
        url: (function build_absolute_url() {
            var protocol = req.socket.encrypted ? 'https' : 'http',
                host = req.headers.host || '<no host>';
            return protocol+'://'+host+req.url;
        }()),
        env: process.env
    };
    return kwargs;
};
