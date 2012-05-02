// borrowed from https://github.com/keithamus/travis-ci-node-and-browser-qunit
var fs = require('fs'),
    page = new WebPage(),
    file = fs.absolute('test/test.html');
    testResults = {};


page.onConsoleMessage = function(msg) {
        console.log(page.lib + ': ' + msg);
        if (/^Tests completed in/.test(msg)) {
            testResults[page.lib] = page.evaluate(function () {
                if (window.QUnit && QUnit.config && QUnit.config.stats) {
                    return QUnit.config.stats.bad || 0;
                }
                return 1;
            });
            if (Object.keys(testResults).length === 2) {
                phantom.exit(testResults.jQuery || testResults.zepto);
            }
        }
    };

function runTests(filePath, lib) {
    filePath = 'file://' + filePath + '?lib=' + lib;
    console.log("Testing " + filePath);
    page.open( filePath, function (status) {
        page.lib = lib;
        if (status !== 'success') {
            console.log('FAIL to load the address');
            phantom.exit(1);
        }
    });
}

runTests(file, 'jQuery');
// quick and dirty: wait 1 second, then test with zepto
setTimeout(function () {
    runTests(file, 'zepto');
}, 1000);