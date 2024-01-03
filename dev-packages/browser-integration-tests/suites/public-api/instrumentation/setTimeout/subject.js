function callback() {
  throw new Error('setTimeout_error');
}

setTimeout(callback, 0);
