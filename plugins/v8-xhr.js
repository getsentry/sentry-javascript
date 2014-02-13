/**
 * Chrome/V8 XHR Post plugin
 *
 * Allows raven-js to send log entries using XHR and CORS for
 * environments where the Origin and Referer headers are missing (e.g Chrome plugins).
 *
 * Usage: Raven.config('https+post://...');
 * */

;(function(window, Raven, undefined){
    'use strict';
    var V8Transport = window.V8Transport = {
        setup: function(dsn, triggerEvent){
            if(!this.hasCORS() && window.console && console.error){
                console.error('This browser lacks support for CORS. Falling back to the default transport');
                delete dsn.pass;
                HTTPGetTransport.setup(dsn);
                return HTTPGetTransport;
            }

            if(!dsn.pass)
                throw new RavenConfigError('The https+post V8 transport needs the private key to be set in the DSN.');

            this.triggerEvent = triggerEvent;
            this.dsn = dsn;
            return this;
        },

        hasCORS: function(){
            return 'withCredentials' in new XMLHttpRequest();
        },

        getAuthString: function(){
            if (this.cachedAuth) return this.cachedAuth;

            var qs = [
                'sentry_version=4',
                'sentry_client=raven-js/' + Raven.VERSION,
                'sentry_key=' + this.dsn.user,
                'sentry_secret=' + this.dsn.pass
            ];

            return this.cachedAuth = 'Sentry ' + qs.join(',');
        },

        send: function(data, endpoint){
            var xhr = new XMLHttpRequest(),
            triggerEvent = this.triggerEvent;


            xhr.open('POST', endpoint, true);
            xhr.setRequestHeader('X-Sentry-Auth', this.getAuthString());
            xhr.setRequestHeader('Content-Type', 'application/json; charset=utf-8');

            xhr.onload = function success() {
                triggerEvent('success', {
                    data: data,
                    src: endpoint
                });
            };
            xhr.onerror = xhr.onabort = function failure() {
                triggerEvent('failure', {
                    data: data,
                    src: endpoint
                });
            };

            xhr.send(JSON.stringify(data));
        }
    }

    Raven.registerTransport('https+post', V8Transport);
}(this, Raven));

