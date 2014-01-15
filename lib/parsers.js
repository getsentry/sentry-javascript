var utils = require('./utils');
var url = require('url');
var cookie = require('cookie');

module.exports.parseText = function parseText(message, kwargs) {
    kwargs = kwargs || {};
    kwargs['message'] = message;
    return kwargs;
};

module.exports.parseError = function parseError(err, kwargs, cb) {
    utils.parseStack(err, function(frames) {
        kwargs['message'] = err.name + ': ' + (err.message || '<no message>');
        kwargs['sentry.interfaces.Exception'] = {
            type: err.name,
            value:err.message
        };
        kwargs['sentry.interfaces.Stacktrace'] = {frames: frames};

        for (var n = frames.length - 1; n >= 0; n--) {
            if (frames[n].in_app) {
                kwargs['culprit'] = utils.getCulprit(frames[n]);
                break;
            }
        }

        cb(kwargs);
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

    // create absolute url
    var host = req.headers.host || '<no host>';
    var full_url = (req.socket.encrypted ? 'https' : 'http') + '://' + host + req.url;

    var http = {
        method: req.method,
        query_string: url.parse(req.url).query,
        headers: req.headers,
        cookies: req.cookies || cookie.parse(req.headers.cookies || ''),
        data: req.body || '<unavailable>',
        url: full_url,
        env: process.env
    };

    var ip = (req.headers['x-forwarded-for'] || '').split(',')[0] ||
             req.connection.remoteAddress;
    http.env.REMOTE_ADDR = ip;
    kwargs['sentry.interfaces.Http'] = http;
    return kwargs;
};
