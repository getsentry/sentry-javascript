import { startEventProxyServer } from './event-proxy-server';

startEventProxyServer({
  port: 3031,
  proxyServerName: 'esm-loader-node-express-app',
});
