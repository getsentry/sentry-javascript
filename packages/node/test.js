const { init, captureException, addBreadcrumb } = require('./dist/index');

init({
  dsn: 'http://asdasdq@aas24d.com/12',
  beforeSend: function(data) {
    console.log(data);
    return data;
  },
});

const { get } = require('http');

get('http://example.com', res => {
  console.debug('foo');

  captureException(new Error('asd'));
  captureException(new Error('asd2'));

  setTimeout(function() {
    new Promise(function(res, rej) {
      rej(new Error('baz'));
    });
  }, 1000);

  setTimeout(function() {
    new Promise(function(res, rej) {
      rej(new Error('baz'));
    });
  }, 2000);
});
