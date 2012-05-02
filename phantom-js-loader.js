// borrowed from https://github.com/keithamus/travis-ci-node-and-browser-qunit
var fs = require('fs'),
    page = new WebPage(),
    file = fs.absolute('test/test.html'),
    lib = phantom.args[0] || 'jquery',
    path = 'file://' + file + '?lib=' + lib;

page.onConsoleMessage = function(msg) {
    console.log(lib + ': ' + msg);
    if (/^Tests completed in/.test(msg)) {
        phantom.exit(page.evaluate(function () {
            if (window.QUnit && QUnit.config && QUnit.config.stats) {
                return QUnit.config.stats.bad || 0;
            }
            return 1;
        }));
    }
};

page.open(path, function (status) {
    console.log('Testing: ' + path);
    if (status !== 'success') {
        console.log('FAIL to load the address');
        phantom.exit(1);
    }
});
