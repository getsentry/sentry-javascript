var raven = require('../')
  , fs = require('fs')
  , nock = require('nock')
  , mockudp = require('mock-udp');

var dsn = 'https://public:private@app.getsentry.com/269';

var _oldConsoleWarn = console.warn;
function mockConsoleWarn() {
    console.warn = function() {
        console.warn._called = true;
    };
    console.warn._called = false;
}
function restoreConsoleWarn() {
    console.warn = _oldConsoleWarn;
}

describe('raven.version', function(){
    it('should be valid', function(){
        raven.version.should.match(/^\d+\.\d+\.\d+(-\w+)?$/);
    });

    it('should match package.json', function(){
        var version = require('../package.json').version;
        raven.version.should.equal(version);
    });
});

describe('raven.Client', function(){
    var client;
    beforeEach(function(){
        process.env.NODE_ENV='production';
        client = new raven.Client(dsn);
    });

    it('should parse the DSN with options', function(){
        var expected = {
            protocol: 'https',
            public_key: 'public',
            private_key: 'private',
            host: 'app.getsentry.com',
            path: '',
            project_id: 269,
            port: 443
        };
        var client = new raven.Client(dsn, {name: 'YAY!', site:'Googlez'});
        client.dsn.should.eql(expected);
        client.name.should.equal('YAY!');
        client.site.should.equal('Googlez');
    });

    it('should pull SENTRY_DSN from environment', function(){
        var expected = {
            protocol: 'https',
            public_key: 'abc',
            private_key: '123',
            host: 'app.getsentry.com',
            path: '',
            project_id: 1,
            port: 443
        };
        process.env.SENTRY_DSN='https://abc:123@app.getsentry.com/1';
        var client = new raven.Client();
        client.dsn.should.eql(expected);
        delete process.env.SENTRY_DSN; // gotta clean up so it doesn't leak into other tests
    });

    it('should pull SENTRY_DSN from environment when passing options', function(){
        var expected = {
            protocol: 'https',
            public_key: 'abc',
            private_key: '123',
            host: 'app.getsentry.com',
            path: '',
            project_id: 1,
            port: 443
        };
        process.env.SENTRY_DSN='https://abc:123@app.getsentry.com/1';
        var client = new raven.Client({name: 'YAY!'});
        client.dsn.should.eql(expected);
        client.name.should.equal('YAY!');
        delete process.env.SENTRY_DSN; // gotta clean up so it doesn't leak into other tests
    });

    it('should be disabled when no DSN specified', function(){
        mockConsoleWarn();
        var client = new raven.Client();
        client._enabled.should.eql(false);
        console.warn._called.should.eql(false);
        restoreConsoleWarn();
    });

    it('should pull SENTRY_NAME from environment', function(){
        process.env.SENTRY_NAME='new_name';
        var client = new raven.Client(dsn);
        client.name.should.eql('new_name');
        delete process.env.SENTRY_NAME;
    });

    it('should pull SENTRY_SITE from environment', function(){
        process.env.SENTRY_SITE='Googlez';
        var client = new raven.Client(dsn);
        client.site.should.eql('Googlez');
        delete process.env.SENTRY_SITE;
    });

    it('should be disabled for a falsey DSN', function(){
        mockConsoleWarn();
        var client = new raven.Client(false);
        client._enabled.should.eql(false);
        console.warn._called.should.eql(false);
        restoreConsoleWarn();
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

    describe('#captureMessage()', function(){
        it('should send a plain text message to Sentry server', function(done){
            var scope = nock('https://app.getsentry.com')
                .filteringRequestBody(/.*/, '*')
                .post('/api/store/', '*')
                .reply(200, 'OK');

            client.on('logged', function(){
                scope.done();
                done();
            });
            client.captureMessage('Hey!');
        });

        it('should emit error when request returns non 200', function(done){
            var scope = nock('https://app.getsentry.com')
                .filteringRequestBody(/.*/, '*')
                .post('/api/store/', '*')
                .reply(500, 'Oops!');

            client.on('error', function(){
                scope.done();
                done();
            });
            client.captureMessage('Hey!');
        });
    });

    describe('#captureError()', function(){
        it('should send an Error to Sentry server', function(done){
            var scope = nock('https://app.getsentry.com')
                .filteringRequestBody(/.*/, '*')
                .post('/api/store/', '*')
                .reply(200, 'OK');

            client.on('logged', function(){
                scope.done();
                done();
            });
            client.captureError(new Error('wtf?'));
        });

        it('should send an Error to Sentry server on another port', function(done){
            var scope = nock('https://app.getsentry.com:8443')
                .filteringRequestBody(/.*/, '*')
                .post('/api/store/', '*')
                .reply(200, 'OK');

            var dsn = 'https://public:private@app.getsentry.com:8443/269';
            var client = new raven.Client(dsn);
            client.on('logged', function(){
                scope.done();
                done();
            });
            client.captureError(new Error('wtf?'));
        });

        it('should send an Error to Sentry server over UDP', function(done){
            var scope = mockudp('app.getsentry.com:1234');

            var dsn = 'udp://public:private@app.getsentry.com:1234/269';
            var client = new raven.Client(dsn);
            client.on('logged', function(){
                scope.done();
                done();
            });
            client.captureError(new Error('wtf?'));
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
