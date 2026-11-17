import { tracingChannel } from 'node:diagnostics_channel';
import { beforeAll, describe, expect, it } from 'vitest';
import { instrumentExpress } from '../../src/integrations/express/instrumentation';
import { getLayerRegisteredPath } from '../../src/integrations/express/route';
import type { ExpressLayer, RegistrationChannelContext } from '../../src/integrations/express/types';
import { CHANNELS } from '../../src/orchestrion/channels';

describe('Express layer registration', () => {
  const channel = tracingChannel(CHANNELS.ROUTER_REGISTER);

  beforeAll(() => {
    instrumentExpress({}, tracingChannel);
  });

  describe('when the events arrive during the call', () => {
    it('records the path of a `route` call on the new layer', () => {
      const route = {};
      const layer: ExpressLayer = { route };
      const router: { stack: ExpressLayer[] } = { stack: [] };
      const call: RegistrationChannelContext = { arguments: ['/users/:id'], self: router };

      channel.start.publish(call);
      router.stack.push(layer);
      call.result = route;
      channel.end.publish(call);

      expect(getLayerRegisteredPath(layer)).toBe('/users/:id');
    });

    it('records the path of a `use` call on the new layer', () => {
      const handler = (): void => {};
      const layer: ExpressLayer = { handle: handler };
      const router: { stack: ExpressLayer[] } = { stack: [] };
      const call: RegistrationChannelContext = { arguments: ['/api', handler], self: router };

      channel.start.publish(call);
      router.stack.push(layer);
      call.result = router;
      channel.end.publish(call);

      expect(getLayerRegisteredPath(layer)).toBe('/api');
    });

    it('records the path of a `use` call on a layer that wraps the handler', () => {
      const handler = (): void => {};
      // For example `express-async-errors`, which wraps each handler in a setter on `Layer.prototype.handle`.
      const layer: ExpressLayer = { handle: (): void => handler() };
      const router: { stack: ExpressLayer[] } = { stack: [] };
      const call: RegistrationChannelContext = { arguments: ['/api', handler], self: router };

      channel.start.publish(call);
      router.stack.push(layer);
      call.result = router;
      channel.end.publish(call);

      expect(getLayerRegisteredPath(layer)).toBe('/api');
    });

    it('records the path of a `use` call on the new layer when an earlier layer has the same handler', () => {
      const handler = (): void => {};
      // Added before the SDK subscribed, so no event recorded it.
      const earlierLayer: ExpressLayer = { handle: handler };
      const layer: ExpressLayer = { handle: handler };
      const router = { stack: [earlierLayer] };
      const call: RegistrationChannelContext = { arguments: ['/v2', handler], self: router };

      channel.start.publish(call);
      router.stack.push(layer);
      call.result = router;
      channel.end.publish(call);

      expect(getLayerRegisteredPath(earlierLayer)).toBeUndefined();
      expect(getLayerRegisteredPath(layer)).toBe('/v2');
    });
  });

  // Cloudflare publishes the events of calls at module scope with the first request.
  describe('when the events arrive after all calls', () => {
    it('records the path of each `route` call', () => {
      const usersRoute = {};
      const postsRoute = {};
      const usersLayer: ExpressLayer = { route: usersRoute };
      const postsLayer: ExpressLayer = { route: postsRoute };
      const router = { stack: [usersLayer, postsLayer] };

      for (const call of [
        { arguments: ['/users/:id'], self: router, result: usersRoute },
        { arguments: ['/posts/:id'], self: router, result: postsRoute },
      ]) {
        channel.start.publish(call);
        channel.end.publish(call);
      }

      expect(getLayerRegisteredPath(usersLayer)).toBe('/users/:id');
      expect(getLayerRegisteredPath(postsLayer)).toBe('/posts/:id');
    });

    it('records the path of each `use` call', () => {
      const handler = (): void => {};
      const v1Layer: ExpressLayer = { handle: handler };
      const pathlessLayer: ExpressLayer = { handle: handler };
      const v2Layer: ExpressLayer = { handle: handler };
      const router = { stack: [v1Layer, pathlessLayer, v2Layer] };

      for (const call of [
        { arguments: ['/v1', handler], self: router, result: router },
        { arguments: [handler], self: router, result: router },
        { arguments: ['/v2', handler], self: router, result: router },
      ]) {
        channel.start.publish(call);
        channel.end.publish(call);
      }

      expect(getLayerRegisteredPath(v1Layer)).toBe('/v1');
      expect(getLayerRegisteredPath(pathlessLayer)).toBeUndefined();
      expect(getLayerRegisteredPath(v2Layer)).toBe('/v2');
    });
  });
});
