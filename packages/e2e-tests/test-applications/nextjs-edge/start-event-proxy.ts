import { startEventProxyServer } from '../../test-utils/event-proxy-server';

export const proxyServerName = 'nextjs-edge';

startEventProxyServer({
  port: Number(process.env.BASE_PORT) + Number(process.env.PORT_MODULO) + Number(process.env.PORT_GAP),
  proxyServerName,
});
