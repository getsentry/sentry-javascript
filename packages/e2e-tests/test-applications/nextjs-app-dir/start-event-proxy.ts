import { startEventProxyServer } from '../../test-utils/event-proxy-server';

startEventProxyServer({
  port:
    Number(process.env.BASE_PORT ?? 5698) + Number(process.env.PORT_MODULO ?? 0) + Number(process.env.PORT_GAP ?? 0),
  proxyServerName: 'nextjs-13-app-dir',
});
