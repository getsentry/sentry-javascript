/*jshint mocha:true*/
/*global assert:false, console:true*/
'use strict';

var Events = require('../src/events');

describe('events', function () {
    describe('on', function () {
        it('should create a listeners property and assign the listener to the event name', function () {
            var self = {};
            var listener = function () {};
            Events.on.call(self, 'thinghappened', listener);

            assert.equal(self._listeners.thinghappened[0], listener);
        });
    });

    describe('off', function () {
        it('should remove all listeners bound to the given event name', function () {
            var self = {
                _listeners: {
                    thinghappened: [
                        function () {},
                        function () {}
                    ]
                }
            };
            Events.off.call(self, 'thinghappened');
            assert.equal(self._listeners.thinghappened.length, 0);
        });

        it('should remove only the given listener bound the given event name', function () {
            var foo = function () {};
            var bar = function () {};
            var baz = function () {};
            var self = {
                _listeners: {
                    thinghappened: [foo, bar, baz]
                }
            };
            Events.off.call(self, 'thinghappened', bar);
            assert.deepEqual(self._listeners.thinghappened, [foo, baz]); // 'bar' removed
        });
    });

    describe('trigger', function () {
        it('should trigger any matching listeners bound to the given event name', function () {
            var foo = this.sinon.stub();
            var bar = this.sinon.stub();
            var baz = this.sinon.stub();
            var self = {
                _listeners: {
                    thinghappened: [foo, baz],
                    somethingelsehappened: [bar]
                }
            };
            Events.trigger.call(self, 'thinghappened', { 'a': 123 }, 1337);

            assert.isTrue(foo.calledOnce);
            assert.deepEqual(foo.getCall(0).args, [{ 'a': 123 }, 1337]);

            assert.isTrue(baz.calledOnce);
            assert.deepEqual(baz.getCall(0).args, [{ 'a': 123 }, 1337]);

            assert.isFalse(bar.called);
        });
    });
});
