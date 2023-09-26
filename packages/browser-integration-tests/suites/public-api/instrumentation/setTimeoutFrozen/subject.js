function callback() {
  throw new Error('setTimeout_error');
}

setTimeout(Object.freeze(callback), 0);
