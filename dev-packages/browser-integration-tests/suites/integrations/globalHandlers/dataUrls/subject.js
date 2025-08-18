const workerCode = `
  self.addEventListener('message', (event) => {
    if (event.data.type === 'error') {
      throw new Error('Error thrown in worker');
    }
  });
`;

const worker = new Worker(`data:text/javascript;base64,${btoa(workerCode)}`);

worker.postMessage({ type: 'error' });
