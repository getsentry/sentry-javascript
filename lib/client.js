var parsers = require('./parsers'),
    zlib = require('zlib'),
    utils = require('./utils'),
    parseUrl = require('url').parse,
    uuid = require('node-uuid'),
    http = {http: require('http'), https: require('https')};

module.exports.version = '0.2.0-dev';

var Client = function Client(dsn, options) {
    if(arguments.length === 0) {
        // no arguments, use default from environment
        dsn = process.env.SENTRY_DSN;
        options = {};
    }
    if(typeof dsn === 'object') {
        // They must only be passing through options
        options = dsn;
        dsn = process.env.SENTRY_DSN;
    }
    options = options || {};
    this.dsn = utils.parseDSN(dsn);
    this.name = options.name || process.env.SENTRY_NAME || require('os').hostname();
    this.site = options.site || process.env.SENTRY_SITE;
    this.root = options.root || process.cwd();
    if(!process.env.NODE_ENV || !(process.env.NODE_ENV == 'production' || process.env.NODE_ENV == 'test')) {
        console.warn('Warning: Sentry logging is disabled, please set NODE_ENV=production');
        this._enabled = false;
    } else {
        this._enabled = true;
    }
}, _ = Client.prototype;

module.exports.Client = Client;

_.getIdent =
_.get_ident = function getIdent(result) {
    return result.id+'$'+result.checksum;
};

_.process = function process(kwargs) {
    var event_id = uuid().replace(/-/g, ''),
        checksum;

    kwargs['modules'] = utils.getModules();
    kwargs['server_name'] = kwargs['server_name'] || this.name;
    kwargs['extra'] = kwargs['extra'] || {};
    kwargs['extra']['node'] = process.version;

    if(!kwargs['checksum']){
        checksum = kwargs['checksum'] = utils.constructChecksum(kwargs);
    } else {
        checksum = kwargs['checksum'];
    }

    kwargs['event_id'] = event_id;
    kwargs['timestamp'] = new Date().toISOString().split('.')[0];
    kwargs['project'] = this.dsn.project_id;
    kwargs['site'] = kwargs['site'] || this.site;
    
    // this will happen asynchronously. We don't care about it's response.
    this._enabled && this.send(kwargs);

    return {'id': event_id, 'checksum': checksum};
};

_.sendRemote = function sendRemote(message, headers, cb) {
    var self = this;
    var options = {
        host: self.dsn.host,
        path: self.dsn.path + '/api/store/',
        headers: headers,
        method: 'POST'
    }, req = http[self.dsn.protocol].request(options, function(res){
        res.setEncoding('utf8');
        res.on('data', function(data) {
            // don't care!
        });
    });
    req.on('error', function(e){
        // do we care?
    });
    req.end(message);
};

_.send = function send(kwargs) {
    var self = this;
    zlib.deflate(JSON.stringify(kwargs), function(err, buff) {
        var message = buff.toString('base64'),
            timestamp = new Date().getTime(),
            signature = utils.getSignature(self.dsn.private_key, message, timestamp),
            headers = {
                'X-Sentry-Auth': utils.getAuthHeader(signature, timestamp, self.dsn.public_key, self.dsn.project_id),
                'Content-Type': 'application/octet-stream',
                'Content-Length': message.length
            };
            
        self.sendRemote(message, headers);
    });
};

_.captureMessage = function captureMessage(message, kwargs, cb) {
    if(!cb && typeof kwargs === 'function') {
        cb = kwargs;
        kwargs = {};
    } else {
        kwargs = kwargs || {};
    }
    var result = this.process(parsers.parseText(message, kwargs));
    cb && cb(result);
    return result;
};

_.captureError =
_.captureException = function captureError(err, kwargs, cb) {
    var self = this;
    if(!cb && typeof kwargs === 'function') {
        cb = kwargs;
        kwargs = {};
    } else {
        kwargs = kwargs || {};
    }
    parsers.parseError(err, kwargs, function(kw) {
        var result = self.process(kw);
        cb && cb(result);
    });
};

_.captureQuery = function captureQuery(query, engine, kwargs, cb) {
    if(!cb && typeof kwargs === 'function') {
        cb = kwargs;
        kwargs = {};
    } else {
        kwargs = kwargs || {};
    }
    var result = this.process(parsers.parseQuery(query, engine, kwargs));
    cb && cb(result);
    return result;
};

_.patchGlobal = function patchGlobal() {
    module.exports.patchGlobal(this);
};

module.exports.patchGlobal =
module.exports.patch_global = function patchGlobal(client) {
    var util = require('util');
    client = (client instanceof Client) ? client : new Client(client);
    process.on('uncaughtException', function(err) {
        client.createFromError(err, function(result) {
            util.log('uncaughtException: '+client.get_ident(result));
        });
    });
};
