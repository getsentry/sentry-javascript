var Client = require('../client').Client;

module.exports = function raven(options) {
    var client = (options instanceof Client) ? options : new Client(options);
    return function(err, req, res, next) {
        var kwargs = {
            'sentry.interfaces.Http': {
                method: req.method,
                data: {META: {
                    headers: req.headers,
                }},
                url: (function build_absolute_url(req) {
                    var protocol = req.socket.encrypted ? 'https' : 'http',
                        host = req.headers.host || '<no host>';
                    return protocol+'://'+host+req.url;
                }(req))
            }
        };
        client.createFromError(err, kwargs, function(result) {
            result.ident = client.getIdent(result);
            res.sentry = result;
            next(err, req, res);
        });
    };
};