// @ts-expect-error - Importing with `.ts` extention to allow ts-node to find this file
import { startEventProxyServer } from './event-proxy-server.ts';

startEventProxyServer({
  port: 3031,
  proxyServerName: 'create-remix-app-express',
});
