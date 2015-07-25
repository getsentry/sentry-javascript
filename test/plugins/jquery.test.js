// TODO(dcramer): need some kind of clean setup state and dynamic
// loading of the jquery plugin
describe('jQuery', function(){
    describe('.fn.ready', function(){
        it('captures exceptions #integration', function(){
            var err = new Error('foo');
            this.sinon.stub(Raven, 'captureException');
            try {
                jQuery(function(){
                    throw err;
                });
            } catch (err2) {
                if (err2 !== err) throw err2;
            }
            assert.isTrue(Raven.captureException.called);
            assert.equal(Raven.captureException.lastCall.args[0], err);
        });
    });

    describe('.Deferred', function(){
        var err;

        // testing $.Deferred's promises
        var deferredPromises = {
            done: 'resolve',
            then: 'resolve',
            fail: 'reject',
            always: 'reject',
            progress: 'notify' // since 1.7
        };

        // testing $.Deferred's promises with resolveWith, rejectWith and notifyWith
        var deferredPromisesWith = {
            done: 'resolveWith',
            then: 'resolveWith',
            fail: 'rejectWith',
            always: 'resolveWith',
            progress: 'notifyWith' // since 1.7
        };

        var assertErrorRecorded = function(func) {
            try {
                func();
            } catch(exc1) {
                if (exc1 !== err) throw exc1;
            }
            assert.isTrue(Raven.captureException.called);
            assert.equal(Raven.captureException.lastCall.args[0], err);
        };

        beforeEach(function(){
            err = new Error('foo');
            this.sinon.stub(Raven, 'captureException');
        });

        for (var key in deferredPromises) {
            it('captures errors from ' + key, function(key){
                return function(){
                    assertErrorRecorded(function(){
                        var dfd = jQuery.Deferred();
                        dfd.promise()[key](function() {
                            throw err;
                        });
                        dfd[deferredPromises[key]]();
                    });
                };
            }(key));
        }

        for (var key in deferredPromisesWith) {
            it('captures errors from ' + key + ' with context', function(key){
                return function(){
                    assertErrorRecorded(function(){
                        var dfd = $.Deferred();
                        dfd.promise()[key](function() {
                            throw err;
                        });
                        dfd[deferredPromisesWith[key]](dfd);
                    });
                };
            }(key));
        }
    });
});
