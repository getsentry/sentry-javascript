var Client = require('../client').Client
  , url = require('url');

module.exports = function raven(client) {
    client = (client instanceof Client) ? client : new Client(client);
    return function(err, req, res, next) {
        var kwargs = {
            'sentry.interfaces.Http': {
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
            }
        };
        client.createFromError(err, kwargs, function(result) {
            res.sentry = client.getIdent(result);
            next(err, req, res);
        });
    };
};