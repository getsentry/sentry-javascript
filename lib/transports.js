var events = require('events')
  , util = require('util');

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
        host: self.dsn.host,
        path: self.dsn.path + '/api/store/',
        headers: headers,
        method: 'POST',
        port: self.dsn.port
    }, req = this.transport.request(options, function(res){
        res.setEncoding('utf8');
        res.on('data', function(data) {
            // don't care!
        });
        res.on('end', function(){
            if(res.statusCode === 200) {
                self.emit('logged');
            } else {
                self.emit('error');
            }
        });
    });
    req.on('error', function(e){
        self.emit('error');
    });
    req.end(message);
}

var https = require('https');
function HTTPSTransport() {
    this.defaultPort = 443;
    this.transport = https;
}
util.inherits(HTTPSTransport, HTTPTransport);


module.exports.http = new HTTPTransport();
module.exports.https = new HTTPSTransport();
