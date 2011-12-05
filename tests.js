var connect = require('connect'),
    raven = require('./index'),
    raven_middleware = require('./lib/middleware/connect-raven');

var options = {
    key: 'testing123',
    servers: ['http://sentry.dev:9000/store/'],
},
client = new raven.Client(options);

client.createFromText('Testing!!!', function(result){});

raven.patchGlobal(options);

function handle_request(req, res) {
    throw new Error('broke');
}

connect(function connect(req, res){
    handle_request(req, res);
}, raven_middleware(client), function(err, req, res, next) {
    res.statusCode = 500;
    res.end(JSON.stringify(res.sentry));
}).listen(3000);

// testing the patch_global method
//ffdasfsd.fdasfd;