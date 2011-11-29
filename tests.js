var connect = require('connect'),
    raven = require('./lib/middleware/connect-raven');

var raven_options = {
    key: 'testing123',
    servers: ['http://sentry.dev:9000/store/'],
};

connect(function(req, res){
    idontexist['what'];
}, raven(raven_options)).listen(3000);
