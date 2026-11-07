import { createApp, createRouter, defineWebSocketHandler } from "h3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import tunnelPlugin from "../../../src/runtime/plugins/tunnel-legacy.server";

const { setTunnelDefaults, useRuntimeConfig } = vi.hoisted(() => ({
  setTunnelDefaults: vi.fn(),
  useRuntimeConfig: vi.fn(),
}));

vi.mock("@sentry/core/server", () => ({
  _INTERNAL_setTunnelDefaults: setTunnelDefaults,
}));

vi.mock("nitropack/runtime", () => ({ useRuntimeConfig }));

type NitroApp = Parameters<typeof tunnelPlugin>[0];

describe("tunnel-legacy.server", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useRuntimeConfig.mockReturnValue({ app: { baseURL: "/base/" } });
  });

  it("serves the tunnel under the app's base URL", () => {
    tunnelPlugin({ h3App: createApp() } as unknown as NitroApp);

    expect(setTunnelDefaults).toHaveBeenCalledWith({ basePath: "/base/" });
  });

  it("keeps the app's WebSocket handlers resolvable", async () => {
    const app = createApp();
    const router = createRouter();
    const upgrade = vi.fn();
    router.use("/ws/:code", defineWebSocketHandler({ upgrade }));
    // Nitro mounts its router on the app base URL
    app.use("/", router.handler);

    tunnelPlugin({ h3App: app } as unknown as NitroApp);

    const hooks = await app.websocket.resolve!(
      new Request("http://localhost/ws/abc") as never,
    );

    expect(hooks.upgrade).toBe(upgrade);
  });
});
