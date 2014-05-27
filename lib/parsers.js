var cookie = require('cookie');
var isPlainObject = require('lodash._shimisplainobject');
var urlParser = require('url');
var utils = require('./utils');

module.exports.parseText = function parseText(message, kwargs) {
    kwargs = kwargs || {};
    kwargs.message = message;

    return kwargs;
};

module.exports.parseError = function parseError(err, kwargs, cb) {
    utils.parseStack(err, function(frames) {
        kwargs.message = err.name + ': ' + (err.message || '<no message>');
        kwargs['sentry.interfaces.Exception'] = {
            type: err.name,
            value:err.message
        };
        kwargs['sentry.interfaces.Stacktrace'] = {frames: frames};

        // Save additional error properties to `extra` under the error type (e.g. `extra.AttributeError`)
        var extraErrorProps;
        for (var key in err) {
            if (err.hasOwnProperty(key)) {
                if (key !== 'name' && key !== 'message' && key !== 'stack') {
                    extraErrorProps = extraErrorProps || {};
                    extraErrorProps[key] = err[key];
                }
            }
        }
        if (extraErrorProps) {
            kwargs.extra = kwargs.extra || {};
            kwargs.extra[err.name] = extraErrorProps;
        }

        for (var n = frames.length - 1; n >= 0; n--) {
            if (frames[n].in_app) {
                kwargs.culprit = utils.getCulprit(frames[n]);
                break;
            }
        }

        cb(kwargs);
    });
};

module.exports.parseQuery = function parseQuery(query, engine, kwargs) {
    kwargs = kwargs || {};
    kwargs.message = query;
    kwargs['sentry.interfaces.Query'] = {
        query: query,
        engine: engine
    };
    return kwargs;
};

module.exports.parseRequest = function parseRequest(req, kwargs) {
    kwargs = kwargs || {};

    // headers
    var headers = req.header || req.headers || {};

    // method
    var method = req.method;

    // host
    var host = req.host || headers.host || '<no host>';

    // protocol
    var protocol = ('https' === req.protocol || true === req.secure || true === (req.socket || {}).encrypted ||
            ('https' === (headers['x-forwarded-proto'] || '').split(/\s*,\s*/)[0])) ||
            (443 === Number(headers['x-forwarded-port'] || '')) ? 'https' : 'http';

    // url (including path and query string)
    var originalUrl = req.url;

    // absolute url
    var url = protocol + '://' + host + originalUrl;

    // query string
    var query = req.query || urlParser.parse(originalUrl || '', true).query;

    // cookies
    var cookies = (isPlainObject(req.cookies) ? req.cookies : '' ) || cookie.parse(headers.cookie || headers.cookies || '');

    // body data
    var data = req.body || '<unavailable>';

    // client ip
    var ip = req.ip || (headers['x-forwarded-for'] || '').split(/\s*,\s*/)[0] || (req.connection || {}).remoteAddress;

    // http interface
    var http = {
        method: method,
        query_string: query,
        headers: headers,
        cookies: cookies,
        data: data,
        url: url,
        env: process.env
    };

    // add remote ip
    http.env.REMOTE_ADDR = ip;

    // expose http interface
    kwargs['sentry.interfaces.Http'] = http;

    return kwargs;
};
