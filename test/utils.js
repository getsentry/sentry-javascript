$(document).ready(function() {

    module("Raven.parseHeaders");
    
    test("should parse headers into an object", function() {
        var hstring = "Date: Mon, 06 Feb 2012 17:25:42 GMT\n"
        hstring += "Server: WSGIServer/0.1 Python/2.7.2\n"
        hstring += "Vary: Cookie\n"
        hstring += "Content-Type: text/html; charset=utf-8\n"
        
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
});
