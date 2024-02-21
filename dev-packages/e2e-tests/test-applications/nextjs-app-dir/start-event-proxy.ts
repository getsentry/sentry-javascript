import { startEventProxyServer } from './event-proxy-server';

startEventProxyServer({
  port: 3031,
  proxyServerName: 'nextjs-13-app-dir',
});
