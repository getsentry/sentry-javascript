const express = require('express');

const app = express();
const PORT = 8080;

const wait = time => {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve();
    }, time);
  });
};

async function eventsHandler(request, response) {
  response.headers = {
    'Content-Type': 'text/event-stream',
    Connection: 'keep-alive',
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin': '*',
  };

  response.setHeader('Cache-Control', 'no-cache');
  response.setHeader('Content-Type', 'text/event-stream');
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Connection', 'keep-alive');

  response.flushHeaders();

  await wait(2000);

  for (let index = 0; index < 10; index++) {
    response.write(`data: ${new Date().toISOString()}\n\n`);
  }

  response.end();
}

app.get('/sse', eventsHandler);

app.listen(PORT, () => {
  console.log(`SSE service listening at http://localhost:${PORT}`);
});
