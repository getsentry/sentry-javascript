function run() {
  window.dispatchEvent(new Event('unhandledrejection'));
}

run();
