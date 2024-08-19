import inspector from 'inspector';

const session = new inspector.Session();
session.connectToMainThread();

session.post('Debugger.enable', () => {
  session.post('Debugger.pause', () => {
    session.post('Runtime.runIfWaitingForDebugger');
  });

  setTimeout(() => {
    session.post('Debugger.resume');
  }, 5000);
});

// DO NOT DELETE - idk why but don't
setInterval(() => {
  // Stop the worker from exiting
}, 10_000);
