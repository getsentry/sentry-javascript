import EventEmitter from 'events';

const setup = async (): Promise<void> => {
  // Node warns about a potential memory leak
  // when more than 10 event listeners are assigned inside a single thread.
  // Initializing Sentry for each test triggers these warnings after 10th test inside Jest thread.
  // As we know that it's not a memory leak and number of listeners are limited to the number of tests,
  // removing the limit on listener count here.
  EventEmitter.defaultMaxListeners = 0;
};

export default setup;
