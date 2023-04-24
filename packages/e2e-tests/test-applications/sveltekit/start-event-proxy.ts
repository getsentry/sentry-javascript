import { startEventProxyServer } from './event-proxy-server';

startEventProxyServer({
  port: Number(process.env.BASE_PORT) + Number(process.env.PORT_MODULO) + Number(process.env.PORT_GAP),
  proxyServerName: 'sveltekit',
});
