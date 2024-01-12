const fetch = require('node-fetch');

(async () => {
  try {
    const response = await fetch('https://nodejs.org/download/release/v18.19.0/node-v18.19.0-headers.tar.gz');
    const body = await response.text();

    console.log(body);
  } catch (error) {
    console.log(error)
  }
})()
