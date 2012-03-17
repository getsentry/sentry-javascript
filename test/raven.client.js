var raven = require('../')
  , fs = require('fs')
  , nock = require('nock');

var dsn = 'https://public:private@app.getsentry.com/269';


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
            setTimeout(function(){scope.done(); done();}, 10); // Really should not take more than 10ms to work.
        });
    });
});
