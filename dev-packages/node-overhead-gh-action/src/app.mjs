import * as Sentry from '@sentry/node';
import express from 'express';

const app = express();
const port = 3030;

app.use(express.json());

app.get('/test-get', function (req, res) {
  res.send({ version: 'v1' });
});

app.post('/test-post', function (req, res) {
  const body = req.body;
  res.send(generateResponse(body));
});

Sentry.setupExpressErrorHandler(app);

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Example app listening on port ${port}`);
});

// This is complicated on purpose to simulate a real-world response
function generateResponse(body) {
  const bodyStr = JSON.stringify(body);
  const RES_BODY_SIZE = 1000;

  const bodyLen = bodyStr.length;
  let resBody = '';
  for (let i = 0; i < RES_BODY_SIZE; i++) {
    resBody += `${i}${bodyStr[i % bodyLen]}-`;
  }
  return { version: 'v1', length: bodyLen, resBody };
}
