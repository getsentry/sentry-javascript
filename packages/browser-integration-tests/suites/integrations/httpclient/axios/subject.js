import axios from 'axios';

axios.get('http://localhost:7654/foo').then(response => {
  console.log(response.data);
});
