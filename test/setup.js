Raven.config("eyJwdWJsaWNLZXkiOiAiZTg5NjUyZWMzMGI5NGQ5ZGI2ZWE2ZjI4NTgwYWI0OTkiLCAic2VjcmV0S2V5IjogIjc3ZWM4Yzk5YTg4NTQyNTZhYTY4Y2NiOTFkZDkxMTlkIiwgInNlcnZlcnMiOiBbIi9hcGkvc3RvcmUvIl0sICJ0ZXN0TW9kZSI6IHRydWV9");

var timestamp = 1328155597571;

var $P = new PHP_JS();

// // Monkey-patch $.ajax with a mock function
var ajax_options = {};
$.ajax = function(options) {
    ajax_options = options;
};
