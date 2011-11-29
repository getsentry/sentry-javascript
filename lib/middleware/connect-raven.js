var crypto = require('crypto'),
    utils = require('../utils'),
    Client = require('../raven').Client;

module.exports = function raven(options) {
    var client = new Client(options);
    return function(err, req, res, next) {
        var kwargs = {
            data: {
                headers: req.headers,
                url: req.url,
                originalUrl: req.originalUrl,
                method: req.method
            },
            url: (function build_absolute_url(req) {
                var protocol = req.socket.encrypted ? 'https' : 'http',
                    host = req.headers.host || '<no host>';
                return protocol+'://'+host+req.url;
            }(req))
        };
        var result = client.create_from_exception(err, kwargs);
        res.sentry = {id: result['message_id']};
        res.statusCode = 500;
        res.end(result['message_id']);
    };
};