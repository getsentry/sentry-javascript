import { longWork } from './long-work.js';

setTimeout(() => {
  longWork();
}, 5000);
