/* eslint-disable no-bitwise */

// A tiny, dependency-free MySQL server that speaks just enough of the v10 wire
// protocol for the `mysql` client to connect and run queries. It completes the
// handshake (so `pool.getConnection()` resolves and reaches `connection.query`)
// and replies to every command with a success OK packet (the client treats it
// as a 0-row result, even for `SELECT`). This gives pool queries a real,
// successful connection to instrument — no docker / real database required.
import net from 'node:net';

// MySQL capability flags (only the ones the client checks here).
const CLIENT_PROTOCOL_41 = 0x00000200;
const CLIENT_SECURE_CONNECTION = 0x00008000;
const CLIENT_PLUGIN_AUTH = 0x00080000;
const SERVER_CAPABILITIES = CLIENT_PROTOCOL_41 | CLIENT_SECURE_CONNECTION | CLIENT_PLUGIN_AUTH;

/** Wrap a payload in a MySQL packet: 3-byte little-endian length + 1-byte sequence id. */
function packet(seq: number, payload: Buffer): Buffer {
  const header = Buffer.alloc(4);
  header.writeUIntLE(payload.length, 0, 3);
  header.writeUInt8(seq, 3);
  return Buffer.concat([header, payload]);
}

function initialHandshake() {
  const scramble = Buffer.alloc(20, 1); // 20-byte auth-plugin-data (value is irrelevant — we never verify)
  const parts = [
    Buffer.from([0x0a]), // protocol version 10
    Buffer.from('8.0.0-sentry-test\0', 'latin1'), // server version (NUL-terminated)
    Buffer.from([1, 0, 0, 0]), // connection id
    scramble.subarray(0, 8), // auth-plugin-data-part-1
    Buffer.from([0x00]), // filler
    Buffer.from([SERVER_CAPABILITIES & 0xff, (SERVER_CAPABILITIES >> 8) & 0xff]), // capability flags (lower)
    Buffer.from([0x21]), // charset (utf8_general_ci)
    Buffer.from([0x02, 0x00]), // status flags
    Buffer.from([(SERVER_CAPABILITIES >> 16) & 0xff, (SERVER_CAPABILITIES >> 24) & 0xff]), // capability flags (upper)
    Buffer.from([21]), // length of auth-plugin-data
    Buffer.alloc(10, 0), // reserved
    Buffer.concat([scramble.subarray(8), Buffer.from([0x00])]), // auth-plugin-data-part-2 (+ NUL)
    Buffer.from('mysql_native_password\0', 'latin1'),
  ];
  return Buffer.concat(parts);
}

function okPacket(): Buffer {
  // OK header, 0 affected rows, 0 insert id, status flags, 0 warnings. The client accepts this for any
  // command — including a `SELECT` (treated as a successful 0-row result) — so spans get `status: ok`.
  return Buffer.from([0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00]);
}

function errPacket(): Buffer {
  // ERR for queries that should fail: code 1146 (ER_NO_SUCH_TABLE), SQL state "42S02". The client
  // surfaces this as a query error, so the span gets `status: internal_error`.
  const head = Buffer.from([0xff, 0x7a, 0x04]); // 0xff + error code 1146 (LE)
  const state = Buffer.from('#42S02', 'latin1');
  const msg = Buffer.from("Table 'does_not_exist' doesn't exist", 'latin1');
  return Buffer.concat([head, state, msg]);
}

/** Start the server on the given host/port. Returns the `net.Server` (call `.close()` to stop). */
export function startMysqlTestServer({ host = '127.0.0.1', port = 0 } = {}) {
  const server = net.createServer(socket => {
    socket.on('error', () => {}); // ignore abrupt client disconnects
    socket.write(packet(0, initialHandshake()));

    let sawHandshakeResponse = false;
    socket.on('data', (data: Buffer) => {
      if (!sawHandshakeResponse) {
        // First inbound packet is the client's handshake response → accept auth.
        sawHandshakeResponse = true;
        socket.write(packet(2, okPacket()));
        return;
      }
      // Subsequent command packet: [3-byte len][1-byte seq][1-byte command][payload]. For COM_QUERY
      // (0x03) the payload is the SQL text. Queries referencing the conventional missing table fail
      // (so error-path tests work); every other command succeeds with an OK. The command resets the
      // sequence, so our reply is seq 1.
      const isQuery = data.length > 5 && data[4] === 0x03;
      const sql = isQuery ? data.subarray(5).toString('latin1') : '';
      socket.write(packet(1, sql.includes('does_not_exist') ? errPacket() : okPacket()));
    });
  });
  // Never let a listen error crash the test process.
  server.on('error', () => {});
  server.listen(port, host);
  return server;
}
