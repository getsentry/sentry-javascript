const fetch = require('node-fetch');

(async () => {
  try {
    const response = await fetch('https://github.com/');
    const body = await response.text();

    console.log(body);
  } catch (error) {
    console.log(error)
  }
})()
