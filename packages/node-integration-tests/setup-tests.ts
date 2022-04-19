import EventEmitter from 'events';

const setup = async (): Promise<void> => {
  // Remove MaxEventListeners warning.
  EventEmitter.defaultMaxListeners = 0;
};

export default setup;
