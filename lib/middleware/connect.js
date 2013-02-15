var raven = require('../client');
var parsers = require('../parsers');

module.exports = function connectMiddleware(client) {
    client = (client instanceof raven.Client) ? client : new raven.Client(client);
    return function(err, req, res, next) {
        var kwargs = parsers.parseRequest(req);
        client.captureError(err, kwargs, function(result) {
            res.sentry = client.getIdent(result);
            next(err, req, res);
        });
    };
};