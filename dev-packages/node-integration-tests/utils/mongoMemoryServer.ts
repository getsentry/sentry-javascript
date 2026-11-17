import { MongoMemoryServer } from 'mongodb-memory-server-global';

// `MongoMemoryServer` finds a free port and starts `mongod` on it afterwards. With a port that the
// OS assigns, another process can get the same port in between, and `mongod` fails with "Port
// already in use". The OS does not assign ports below its ephemeral range (32768 on Linux), so each
// suite has its own port there. The suites run in parallel, so no two suites can share a port.
const MONGO_PORTS = {
  mongodb: 27101,
  'mongodb-v4': 27102,
  'mongodb-v5': 27103,
  'mongodb-v6': 27104,
  'mongodb-v7': 27105,
  mongoose: 27106,
  'mongoose-v5': 27107,
  'mongoose-v7': 27108,
  'mongoose-v8': 27109,
  'mongoose-v9': 27110,
  'mongoose-tracing-channel': 27111,
} as const;

/**
 * Starts a `MongoMemoryServer` on the port of the given suite.
 */
export function createMongoMemoryServer(suite: keyof typeof MONGO_PORTS): Promise<MongoMemoryServer> {
  return MongoMemoryServer.create({ instance: { port: MONGO_PORTS[suite] } });
}
