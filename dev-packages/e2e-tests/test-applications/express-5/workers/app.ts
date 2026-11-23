import { httpServerHandler } from 'cloudflare:node';
import { app } from '../src/app';

const PORT = 3030;

app.listen(PORT);

export default httpServerHandler({ port: PORT });
