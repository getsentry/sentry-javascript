import { longWork } from './long-work.js';

setTimeout(() => {
  longWork();
}, 2000);
