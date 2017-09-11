var _Raven = require('../../src/raven');
var chromeExtensionPlugin = require('../../plugins/chrome-extension');

var Raven;
describe('chrome extension plugin', function () {
    beforeEach(function () {
        Raven = new _Raven();
        Raven.config('http://abc@example.com:80/2');
    });

    describe('_normalizeData()', function () {
        it('should normalize culprit & data.stacktrace chrome-extension:// scheme to app://', function () {
            var data = {
                project: '2',
                logger: 'javascript',
                platform: 'javascript',

                culprit: 'chrome-extension://enllhkenpffeechkkdaclgeomlmmamdj/bundle.js',
                message: 'Error: crap',
                exception: {
                    type: 'ReferenceError',
                    values: [{
                        stacktrace:{
                          frames:[{
                            filename: 'chrome-extension://enllhkenpffeechkkdaclgeomlmmamdj/js/file.js'
                          }]
                        }
                    }]
                },
                extra: {}
            };

            chromeExtensionPlugin._normalizeData(data);

            assert.equal(data.culprit, 'app:///bundle.js');
            var exception = data.exception.values[0];
            assert.equal(exception.stacktrace.frames[0].filename, 'app:///js/file.js');
        });
    });
});
