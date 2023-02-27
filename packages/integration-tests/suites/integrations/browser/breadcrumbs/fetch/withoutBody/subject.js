fetch('http://localhost:7654/foo')
  .then(res => {
    return res.json();
  })
  .then(json => {
    // do something with the response
  });
