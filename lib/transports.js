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
HTTPTransport.prototype.send = function(client, message, headers) {
    var self = client;
    var options = {
        hostname: self.dsn.host,
        path: self.dsn.path + 'api/store/',
        headers: headers,
        method: 'POST',
        port: self.dsn.port || this.defaultPort
    }, req = this.transport.request(options, function(res){
        res.setEncoding('utf8');
        var body = [];
        res.on('data', function(data) {
            body.push(data);
        });
        res.on('end', function(){
            if(res.statusCode >= 200 && res.statusCode < 300) {
                self.emit('logged');
            } else {
                body = body.join('');
                var e = new Error('HTTP Error (' + res.statusCode + '): ' + body);
                e.response = res;
                e.statusCode = res.statusCode;
                e.responseBody = body;
                self.emit('error', e);
            }
        });
    });
    req.on('error', function(e){
        self.emit('error', e);
    });
    req.end(message);
}

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
UDPTransport.prototype.send = function(client, message, headers) {
    var self = client;
    message = new Buffer(headers['X-Sentry-Auth'] + '\n\n'+ message);

    var udp = dgram.createSocket('udp4');
    udp.send(message, 0, message.length, self.dsn.port || this.defaultPort, self.dsn.host, function(e, bytes) {
        if(e){
            return self.emit('error', e);
        }
        self.emit('logged');
        udp.close();
    });
}

module.exports.http = new HTTPTransport();
module.exports.https = new HTTPSTransport();
module.exports.udp = new UDPTransport();
module.exports.Transport = Transport;
