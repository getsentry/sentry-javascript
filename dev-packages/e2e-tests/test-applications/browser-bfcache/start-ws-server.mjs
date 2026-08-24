import crypto from 'crypto';
import http from 'http';

// Minimal WebSocket endpoint used only to hold an open connection open on the page, which makes the
// page bfcache-ineligible in Chrome < 149. It completes the handshake and then does nothing.
const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('ws server');
});

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }
  const accept = crypto.createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
  socket.write(
    `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );
});

server.listen(3034, () => {
  // eslint-disable-next-line no-console
  console.log('bfcache ws blocker server listening on 3034');
});
