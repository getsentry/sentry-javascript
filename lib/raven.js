var zlib = require('zlib'),
    utils = require('./utils'),
    parseUrl = require('url').parse,
    uuid = require('node-uuid');

var Client = function(options) {
    this.servers = options.servers;
    this.key = options.key;
    this.name = options.name || require('os').hostname();
    this.site = options.site;
    this.root = options.root || process.cwd();
}, _ = Client.prototype;

module.exports.Client = Client;

_.get_ident = function(result) {
    return result.join('$');
};

_.process = function(kwargs) {
    var message_id = uuid().replace(/-/g, ''),
        checksum;
    
    kwargs['data'] = kwargs['data'] || {};
    kwargs['data']['__sentry__'] = kwargs['data']['__sentry__'] || {};

    kwargs['message_id'] = message_id;
    kwargs['timestamp'] = kwargs['timestamp'] || new Date().getTime()/1000;

    if(!'checksum' in kwargs) {
        checksum = kwargs['checksum'] = utils.construct_checksum(kwargs);
    } else {
        checksum = kwargs['checksum'];
    }

    kwargs['server_name'] = kwargs['server_name'] || this.name;
    kwargs['site'] = kwargs['site'] || this.site;
    console.log(kwargs);
    this.send(kwargs);

    return {'message_id': message_id, 'checksum': checksum};
};

_.send_remote = function(url, message, headers, callback) {
    url = parseUrl(url);
    var options = {
        host: url.hostname,
        path: url.pathname,
        port: url.port,
        headers: headers,
        method: 'POST',
    }, httpclient = require(url.protocol.slice(0, url.protocol.length-1));

    var req = httpclient.request(options, callback);
    req.write(message);
    req.end();
};

_.send = function(kwargs) {
    var self = this;
    zlib.deflate(JSON.stringify(kwargs), function(err, buff) {
        var message = buff.toString('base64');
        //TODO: refactor this to not blast out to all servers at once.
        self.servers.forEach(function(url) {
            var timestamp = Math.round((new Date().getTime()/1000))+'.0', // this is a shitty workout for Sentry
                signature = utils.get_signature(self.key, message, timestamp),
                headers = {
                    'Authorization': utils.get_auth_header(signature, timestamp),
                    'Content-Type': 'application/octet-stream',
                };
            
            self.send_remote(url, message, headers);
        });
    });
};

_.create_from_text = function(message, kwargs) {
    kwargs = kwargs || {};
    kwargs['message'] = message;
    return this.process(kwargs);
};

_.create_from_exception = _.create_from_error = function(err, kwargs) {
    kwargs = kwargs || {};
    kwargs['message'] = err.stack.split('\n')[0];
    kwargs['traceback'] = err.stack;
    // this is shitty. And Node doesn't have "views". What should we do here?
    kwargs['view'] = err.name + ' in ' + err.stack.split('\n')[1].match(/^.*?\((.*?):\d+:\d+\)$/)[1].replace(process.cwd()+'/', '');
    return this.process(kwargs);
};