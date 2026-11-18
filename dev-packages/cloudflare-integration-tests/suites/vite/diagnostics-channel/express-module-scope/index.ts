import { httpServerHandler } from 'cloudflare:node';
import express from 'express';

const PORT = 8080;

const app = express();

app.get('/users/:id', (req, res) => {
  res.json({ id: req.params.id });
});

app.listen(PORT);

export default httpServerHandler({ port: PORT });
