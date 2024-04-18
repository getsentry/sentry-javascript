function run() {
  try {
    throw 'stringError';
  } catch (e) {
    // simulate window.onerror without generating a Script error
    window.onerror('error', 'file.js', 1, 1, e);
  }
}

run();
