var utils = require('./utils');

module.exports.parseText = function parseText(message, kwargs) {
    kwargs = kwargs || {};
    kwargs['message'] = message;
    kwargs['sentry.interfaces.Message'] = {
        message: message,
        params: []
    };
    return kwargs;
};

module.exports.parseError = function parseError(err, kwargs, cb) {
    utils.parseStack(err.stack, function(e, frames) {
        kwargs['message'] = err.name+': '+(err.message || '<no message>');
        kwargs['sentry.interfaces.Exception'] = {type:err.name, value:err.message};
        kwargs['sentry.interfaces.Stacktrace'] = {frames:frames};
        kwargs['culprit'] = (frames[0].filename || 'unknown file').replace(process.cwd()+'/', '')+':'+(frames[0]['function'] || 'unknown function');
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
