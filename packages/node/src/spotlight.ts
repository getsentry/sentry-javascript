import { Server, ServerResponse, createServer } from 'http';
import { NodeClientOptions } from './types';

const defaultResponse = `<!doctype html>
<html>
<head>
        <title>pipe</title>
</head>
<body>
        <pre id="output"></pre>
        <script type="text/javascript">
const Output = document.getElementById("output");
var EvtSource = new EventSource('/stream');
EvtSource.onmessage = function (event) {
        Output.appendChild(document.createTextNode(event.data));
        Output.appendChild(document.createElement("br"));
};
        </script>
</body>
</html>`;

function generate_uuidv4() {
  let dt = new Date().getTime();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    let rnd = Math.random() * 16;
    rnd = (dt + rnd) % 16 | 0;
    dt = Math.floor(dt / 16);
    return (c === 'x' ? rnd : (rnd & 0x3) | 0x8).toString(16);
  });
}

class MessageBuffer<T> {
  private _size: number;
  private _items: [number, T][];
  private _writePos: number = 0;
  private _head: number = 0;
  private _timeout: number = 10;
  private _readers: Map<string, (item: T) => void>;

  public constructor(size = 100) {
    this._size = size;
    this._items = new Array(size);
    this._readers = new Map<string, (item: T) => void>();
  }

  public put(item: T): void {
    const curTime = new Date().getTime();
    this._items[this._writePos % this._size] = [curTime, item];
    this._writePos += 1;
    if (this._head === this._writePos) {
      this._head += 1;
    }

    const minTime = curTime - this._timeout * 1000;
    let atItem;
    while (this._head < this._writePos) {
      atItem = this._items[this._head % this._size];
      if (atItem === undefined) break;
      if (atItem[0] > minTime) break;
      this._head += 1;
    }
  }

  public subscribe(callback: (item: T) => void): string {
    const readerId = generate_uuidv4();
    this._readers.set(readerId, callback);
    setTimeout(() => this.stream(readerId));
    return readerId;
  }

  public unsubscribe(readerId: string): void {
    this._readers.delete(readerId);
  }

  public stream(readerId: string, readPos?: number): void {
    const cb = this._readers.get(readerId);
    if (!cb) return;

    let atReadPos = typeof readPos === 'undefined' ? this._head : readPos;
    let item;
    while (true) {
      item = this._items[atReadPos % this._size];
      if (typeof item === 'undefined') {
        break;
      }
      cb(item[1]);
      atReadPos += 1;
    }
    setTimeout(() => this.stream(readerId, atReadPos), 500);
  }
}

const ENVELOPE = 'envelope';
const EVENT = 'event';

type Payload = [string, string];

let serverInstance: Server;

function getCorsHeader(): { [name: string]: string } {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': '*',
  };
}

function startServer(buffer: MessageBuffer<Payload>, port: number): Server {
  const server = createServer((req, res) => {
    console.log(`[spotlight] Received request ${req.method} ${req.url}`);
    if (req.headers.accept && req.headers.accept == 'text/event-stream') {
      if (req.url == '/stream') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          ...getCorsHeader(),
          Connection: 'keep-alive',
        });
        res.flushHeaders();

        const sub = buffer.subscribe(([payloadType, data]) => {
          res.write(`event:${payloadType}\n`);
          data.split('\n').forEach(line => {
            res.write(`data:${line}\n`);
          });
          res.write('\n');
        });

        req.on('close', () => {
          buffer.unsubscribe(sub);
        });
      } else {
        res.writeHead(404);
        res.end();
      }
    } else {
      if (req.url == '/stream') {
        if (req.method === 'OPTIONS') {
          res.writeHead(204, {
            'Cache-Control': 'no-cache',
            ...getCorsHeader(),
          });
          res.end();
        } else if (req.method === 'POST') {
          let body: string = '';
          req.on('readable', () => {
            const chunk = req.read();
            if (chunk !== null) body += chunk;
          });
          req.on('end', () => {
            const payloadType = req.headers['content-type'] === 'application/x-sentry-envelope' ? ENVELOPE : EVENT;
            buffer.put([payloadType, body]);
            res.writeHead(204, {
              'Cache-Control': 'no-cache',
              ...getCorsHeader(),
              Connection: 'keep-alive',
            });
            res.end();
          });
        } else {
          res.writeHead(200, {
            'Content-Type': 'text/html',
          });
          res.write(defaultResponse);
          res.end();
        }
      } else {
        res.writeHead(404);
        res.end();
      }
    }
  });
  server.on('error', e => {
    if ('code' in e && e.code === 'EADDRINUSE') {
      // console.error('[Spotlight] Address in use, retrying...');
      setTimeout(() => {
        server.close();
        server.listen(port);
      }, 5000);
    }
  });
  server.listen(port, () => {
    console.log(`[Spotlight] Sidecar listening on ${port}`);
  });

  return server;
}

export function setupSidecar(options: NodeClientOptions): void {
  const buffer: MessageBuffer<Payload> = new MessageBuffer<Payload>();

  if (!serverInstance) {
    serverInstance = startServer(buffer, 8969);
  }
}

function shutdown() {
  if (serverInstance) {
    console.log('[Spotlight] Shutting down server');
    serverInstance.close();
  }
}

process.on('SIGTERM', () => {
  shutdown();
});
