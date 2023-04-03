import axios from 'axios';

axios
  .get('http://localhost:7654/foo', {
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', Cache: 'no-cache' },
  })
  .then(response => {
    console.log(response.data);
  });
