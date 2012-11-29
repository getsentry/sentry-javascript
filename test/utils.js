$(document).ready(function() {

    module("Raven.config");

    test("should parse dsn as only argument", function() {
        var dsn = "http://public:secret@example.com:80/project-id";

        Raven.config(dsn);
        var config = Raven.options;

        equal(config['publicKey'], 'public');
        equal(config['secretKey'], 'secret');
        equal(config['servers'][0], 'http://example.com:80/api/project-id/store/');
        equal(config['projectId'], 'project-id');
    });

    test("should accept servers as base URLs and add API info", function() {
        Raven.config({
            "publicKey": "public",
            "servers": ["http://mysentry.com/"],
            "projectId": "project-id"
        });

        var config = Raven.options;

        equal(config['publicKey'], 'public');
        equal(config['servers'][0], 'http://mysentry.com/api/project-id/store/');
        equal(config['projectId'], 'project-id');
    });

    test("should handle base URLs without a trailing slash", function() {
        Raven.config({
            "publicKey": "public",
            "servers": ["http://mysentry.com"],
            "projectId": "project-id"
        });

        var config = Raven.options;

        equal(config['publicKey'], 'public');
        equal(config['servers'][0], 'http://mysentry.com/api/project-id/store/');
        equal(config['projectId'], 'project-id');
    });

    module("Raven.parseHeaders");

    test("should parse headers into an object", function() {
        var hstring = "Date: Mon, 06 Feb 2012 17:25:42 GMT\n";
        hstring += "Server: WSGIServer/0.1 Python/2.7.2\n";
        hstring += "Vary: Cookie\n";
        hstring += "Content-Type: text/html; charset=utf-8\n";

        var headers = Raven.parseHeaders(hstring);
        equal(headers['Date'], "Mon, 06 Feb 2012 17:25:42 GMT");
        equal(headers['Server'], "WSGIServer/0.1 Python/2.7.2");
        equal(headers['Vary'], "Cookie");
        equal(headers['Content-Type'], "text/html; charset=utf-8");
    });

    module("Raven.trimString");

    test("should trim leading space", function() {
        var result = Raven.trimString('  foo');
        equal(result, 'foo');
    });

    test("should trim trailing space", function() {
        var result = Raven.trimString('foo  ');
        equal(result, 'foo');
    });

    module("Raven.parseDSN");

    test("should parse dsn into an object", function() {
        var dsn = "http://public:secret@example.com:80/project-id";

        var config = Raven.parseDSN(dsn);
        equal(config['publicKey'], 'public');
        equal(config['secretKey'], 'secret');
        equal(config['servers'][0], 'http://example.com:80/');
        equal(config['projectId'], 'project-id');
    });


    test("should parse dsn with a path", function() {
        var dsn = "http://public:secret@example.com:80/path/project-id";

        var config = Raven.parseDSN(dsn);
        equal(config['publicKey'], 'public');
        equal(config['secretKey'], 'secret');
        equal(config['servers'][0], 'http://example.com:80/path/');
        equal(config['projectId'], 'project-id');
    });

    test("should parse dsn without a secret key", function() {
        var dsn = "http://public@example.com:80/path/project-id";

        var config = Raven.parseDSN(dsn);
        equal(config['publicKey'], 'public');
        equal(config['secretKey'], '');
        equal(config['servers'][0], 'http://example.com:80/path/');
        equal(config['projectId'], 'project-id');
    });

    module("Raven.arrayMerge");

    test("should compose values from both arrays", function() {
        var arr1 = {foo: "bar"};
        var arr2 = {bar: "baz"};
        var result = Raven.arrayMerge(arr1, arr2);
        equal(result["foo"], "bar");
        equal(result["bar"], "baz");
    });

    test("should overwrite values from second array", function() {
        var arr1 = {foo: "bar"};
        var arr2 = {foo: "baz"};
        var result = Raven.arrayMerge(arr1, arr2);
        equal(result["foo"], "baz");
    });

    test("should handle an undefined second array", function() {
        var arr1 = {foo: "bar"};
        var result = Raven.arrayMerge(arr1);
        equal(result["foo"], "bar");
    });

});
