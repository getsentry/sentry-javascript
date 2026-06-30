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

/**
 * Start the server on the given host/port. Returns the `net.Server` (call `.close()` to stop).
 *
 * `host` defaults to `undefined` so the server listens on all interfaces (dual-stack). The `mysql`
 * client connects to `localhost`, which resolves to IPv6 `::1` first — binding only to IPv4
 * `127.0.0.1` would get `ECONNREFUSED ::1` on Node 18 (where `autoSelectFamily` is off, so it never
 * falls back to IPv4 the way Node 20+ does).
 */
export function startMysqlTestServer({ host, port = 0 }: { host?: string; port?: number } = {}) {
  const server = net.createServer(socket => {
    socket.on('error', () => {}); // ignore abrupt client disconnects
    socket.write(packet(0, initialHandshake()));

    let sawHandshakeResponse = false;
    let buffered = Buffer.alloc(0);
    socket.on('data', (chunk: Buffer) => {
      // TCP may coalesce several packets into one `data` event or split one packet across events, so
      // we can't assume one packet per read. Accumulate bytes and frame on the 3-byte length header,
      // consuming only whole packets — otherwise a coalesced handshake-response + COM_QUERY would lose
      // its tail and the client would hang.
      buffered = buffered.length ? Buffer.concat([buffered, chunk]) : chunk;

      while (buffered.length >= 4) {
        // Packet: [3-byte LE payload length][1-byte seq][payload].
        const payloadLength = buffered.readUIntLE(0, 3);
        const packetLength = 4 + payloadLength;
        if (buffered.length < packetLength) {
          break; // rest of this packet hasn't arrived yet
        }
        const pkt = buffered.subarray(0, packetLength);
        buffered = buffered.subarray(packetLength);

        if (!sawHandshakeResponse) {
          // First inbound packet is the client's handshake response → accept auth.
          sawHandshakeResponse = true;
          socket.write(packet(2, okPacket()));
          continue;
        }

        // Command packet: payload is [1-byte command][args]. For COM_QUERY (0x03) the args are the SQL
        // text. Queries referencing the conventional missing table fail (so error-path tests work);
        // every other command succeeds with an OK. The command resets the sequence, so our reply is seq 1.
        const isQuery = payloadLength > 1 && pkt[4] === 0x03;
        const sql = isQuery ? pkt.subarray(5).toString('latin1') : '';
        socket.write(packet(1, sql.includes('does_not_exist') ? errPacket() : okPacket()));
      }
    });
  });
  // Never let a listen error crash the test process.
  server.on('error', () => {});
  server.listen(port, host);
  return server;
}
