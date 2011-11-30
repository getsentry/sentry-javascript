var crypto = require('crypto'),
    utils = require('../utils'),
    Client = require('../raven').Client;

module.exports = function raven(options) {
    var client = new Client(options);
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
        //console.log(err.stack);
        client.create_from_exception(err, kwargs, function(result) {
            res.sentry = {id: 1};
            res.statusCode = 500;
            res.end(client.get_ident(result));
        });
        
    };
};