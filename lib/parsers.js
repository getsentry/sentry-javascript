var cookie = require('cookie');
var urlParser = require('url');
var utils = require('./utils');

module.exports.parseText = function parseText(message, kwargs) {
    kwargs = kwargs || {};
    kwargs.message = message;

    return kwargs;
};

module.exports.parseError = function parseError(err, kwargs, cb) {
    utils.parseStack(err, function(frames) {
        if (typeof kwargs.message === 'undefined') {
           kwargs.message = err.name + ': ' + (err.message || '<no message>');
        }
        kwargs['exception'] = [{
            type: err.name,
            value:err.message,
            stacktrace: {frames: frames}
        }];

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
                kwargs.culprit = kwargs.culprit || utils.getCulprit(frames[n]);
                break;
            }
        }

        cb(kwargs);
    });
};

module.exports.parseQuery = function parseQuery(query, engine, kwargs) {
    kwargs = kwargs || {};
    kwargs.message = query;
    kwargs['query'] = {
        query: query,
        engine: engine
    };
    return kwargs;
};

module.exports.parseRequest = function parseRequest(req, kwargs) {
    kwargs = kwargs || {};

    // headers:
    //
    //   node: req.headers
    //   express: req.headers
    //   koa: req.header
    //
    var headers = req.headers || req.header || {};

    // method:
    //
    //   node: req.method
    //   express: req.method
    //   koa: req.method
    //
    var method = req.method;

    // host:
    //
    //   node: req.headers.host
    //   express: req.host
    //   koa: req.host
    //
    var host = req.host || headers.host || '<no host>';

    // protocol:
    //
    //   node: <n/a>
    //   express: req.protocol
    //   koa: req.protocol
    //
    var protocol = ('https' === req.protocol || true === req.secure || true === (req.socket || {}).encrypted) ? 'https' : 'http';

    // url (including path and query string):
    //
    //   node: req.originalUrl
    //   express: req.originalUrl
    //   koa: req.url
    //
    var originalUrl = req.originalUrl || req.url;

    // absolute url
    var url = protocol + '://' + host + originalUrl;

    // query string
    //
    //   node: req.url (raw)
    //   express: req.query
    //   koa: req.query
    //
    var query = req.query || urlParser.parse(originalUrl || '', true).query;

    // cookies:
    //
    //   node: req.headers.cookie
    //   express: req.headers.cookie
    //   koa: req.headers.cookie
    //
    var cookies = cookie.parse(headers.cookie || '');

    // body data:
    //
    //   node: req.body
    //   express: req.body
    //   koa: req.body
    //
    var data = req.body || '<unavailable>';

    // client ip:
    //
    //   node: req.connection.remoteAddress
    //   express: req.ip
    //   koa: req.ip
    //
    var ip = req.ip || (req.connection || {}).remoteAddress;

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
    kwargs['request'] = http;

    return kwargs;
};
