Raven.config({
    publicKey: 'e89652ec30b94d9db6ea6f28580ab499',
    secretKey: '77ec8c99a8854256aa68ccb91dd9119d',
    servers: ['/api/store/']
});

var data = {
    "Once": "upon a midnight dreary",
    "while": "I pondered weak and weary"
}
var timestamp = 1328155597571;

// // Monkey-patch $.ajax with a mock function
var ajax_options = {};
$.ajax = function(options) {
    ajax_options = options;
};
