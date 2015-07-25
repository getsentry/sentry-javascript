describe('jQuery', function(){
    describe('.fn.ready', function(){
        it('captures exceptions #integration', function(){
            var err = new Error('foo');
            this.sinon.stub(Raven, 'captureException')
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
});
