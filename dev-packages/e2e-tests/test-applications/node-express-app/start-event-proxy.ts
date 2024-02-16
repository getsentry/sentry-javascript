import { startEventProxyServer } from './event-proxy-server';

startEventProxyServer({
  port: 3031,
  proxyServerName: 'node-express-app',
});
