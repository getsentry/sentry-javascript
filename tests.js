var connect = require('connect'),
    raven = require('./index'),
    raven_middleware = require('./lib/middleware/connect-raven');

var options = {
    key: 'testing123',
    servers: ['http://sentry.dev:9000/store/'],
};

raven.patch_global(options);

connect(function(req, res){
    idontexist['what'];
}, raven_middleware(options)).listen(3000);

// testing the patch_global method
ffdasfsd.fdasfd;