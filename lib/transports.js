var events = require('events');
var util = require('util');

function Transport() {
}
util.inherits(Transport, events.EventEmitter);

var http = require('http');
function HTTPTransport() {
    this.defaultPort = 80;
    this.transport = http;
}
util.inherits(HTTPTransport, Transport);
HTTPTransport.prototype.send = function(client, message, headers, ident) {
    var options = {
        hostname: client.dsn.host,
        path: client.dsn.path + 'api/store/',
        headers: headers,
        method: 'POST',
        port: client.dsn.port || this.defaultPort
    }, req = this.transport.request(options, function(res){
        res.setEncoding('utf8');
        if(res.statusCode >= 200 && res.statusCode < 300) {
            client.emit('logged', ident);
        } else {
            var reason = res.headers['x-sentry-error'];
            var e = new Error('HTTP Error (' + res.statusCode + '): ' + reason);
            e.response = res;
            e.statusCode = res.statusCode;
            e.reason = reason;
            e.sendMessage = message;
            e.requestHeaders = headers;
            e.ident = ident;
            client.emit('error', e);
        }
        // force the socket to drain
        var noop = function(){};
        res.on('data', noop);
        res.on('end', noop);
    });
    req.on('error', function(e){
        client.emit('error', e);
    });
    req.end(message);
};

var https = require('https');
function HTTPSTransport() {
    this.defaultPort = 443;
    this.transport = https;
}
util.inherits(HTTPSTransport, HTTPTransport);

var dgram = require('dgram');
function UDPTransport() {
    this.defaultPort = 12345;
}
util.inherits(UDPTransport, Transport);
UDPTransport.prototype.send = function(client, message, headers, ident) {
    message = new Buffer(headers['X-Sentry-Auth'] + '\n\n'+ message);

    var udp = dgram.createSocket('udp4');
    udp.send(message, 0, message.length, client.dsn.port || this.defaultPort, client.dsn.host, function(e, bytes) {
        if(e){
            return client.emit('error', e);
        }
        client.emit('logged', ident);
        udp.close();
    });
};

module.exports.http = new HTTPTransport();
module.exports.https = new HTTPSTransport();
module.exports.udp = new UDPTransport();
module.exports.Transport = Transport;
