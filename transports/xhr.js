;(function(window, Raven) {
    function urlencode(o) {
        var pairs = [];
        each(o, function(key, value) {
            pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
        });
        return pairs.join('&');
    }

    function xhrTransport(options) {
        var request = new XMLHttpRequest();
        request.onreadystatechange = function (e) {
          if (request.readyState !== 4) {
            return;
          }

          if (request.status === 200) {
            Raven.triggerEvent('success', {
                data: options.data,
                src: options.url
            });
          } else {
            Raven.triggerEvent('failure', {
                data: options.data,
                src: options.url
            });
          }
        };

        request.open('POST', options.url + urlencode(options.auth));
        request.send(JSON.stringify(options.data));
    }

    Raven.globalOptions.transport = xhrTransport;
})(window, Raven)
