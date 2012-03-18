var raven = require('../')
  , fs = require('fs')
  , nock = require('nock');

var dsn = 'https://public:private@app.getsentry.com/269';

function wait(scope, done) {
    setTimeout(function() {
        scope.done(); done();
    }, 10);
}

describe('raven.version', function(){
    it('should be valid', function(){
        raven.version.should.match(/^\d+\.\d+\.\d+(-\w+)?$/);
    });
});

describe('raven.Client', function(){
    var client;
    before(function(){
        client = new raven.Client(dsn);
    });

    describe('#getIdent()', function(){
        it('should match', function(){
            var result = {
                id: 'c988bf5cb7db4653825c92f6864e7206',
                checksum: 'b8a6fbd29cc9113a149ad62cf7e0ddd5'
            };
            client.getIdent(result).should.equal('c988bf5cb7db4653825c92f6864e7206$b8a6fbd29cc9113a149ad62cf7e0ddd5');
        });
    });

    describe('#createFromText()', function(){
        it('should send a plain text message to Sentry server', function(done){
            var scope = nock('https://app.getsentry.com')
                .filteringRequestBody(/.*/, '*')
                .post('/api/store/', '*')
                .reply(200, 'OK');

            client.createFromText('Hey!');
            wait(scope, done);
        });
    });

    describe('#createFromError()', function(){
        it('should send an Error to Sentry server', function(done){
            var scope = nock('https://app.getsentry.com')
                .filteringRequestBody(/.*/, '*')
                .post('/api/store/', '*')
                .reply(200, 'OK');

            client.createFromError(new Error('wtf?'));
            wait(scope, done);
        });
    });

    describe('#patchGlobal()', function(){
        it('should add itself to the uncaughtException event list', function(){
            var before = process._events.uncaughtException;
            client.patchGlobal();
            process._events.uncaughtException.length.should.equal(before.length+1);
            process._events.uncaughtException = before; // patch it back to what it was
        });

        /* Why can't I do this?!?!
        it('should send an uncaughtException to Sentry server', function(done){
            var scope = nock('https://app.getsentry.com')
                .filteringRequestBody(/.*\/, '*')
                .post('/api/store/', '*')
                .reply(200, 'OK');
            var before = process._events.uncaughtException;
            process.removeAllListeners('uncaughtException');
            console.log(process._events);
            client.patchGlobal();
            console.log(process._events);
            ''(); // should be caught and sent to Sentry
            before.forEach(function(cb) {
                // restore old callbacks
                process.on('uncaughtException', cb);
            });
            done();
        });
        */
    });
});
