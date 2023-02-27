fetch('http://localhost:7654/foo', {
  method: 'POST',
  body: '{"foo":"bar"}',
})
  .then(res => {
    return res.json();
  })
  .then(json => {
    // do something with the response
  });
