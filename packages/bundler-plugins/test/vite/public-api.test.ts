import { sentryVitePlugin } from "../../src/vite";
import { describe, it, expect, test, beforeEach, vi } from "vitest";

test("Vite plugin should exist", () => {
  expect(sentryVitePlugin).toBeDefined();
  expect(typeof sentryVitePlugin).toBe("function");
});

describe("sentryVitePlugin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an array of Vite plugins", () => {
    const plugins = sentryVitePlugin({
      authToken: "test-token",
      org: "test-org",
      project: "test-project",
    });

    expect(Array.isArray(plugins)).toBe(true);

    const pluginNames = plugins.map((plugin) => plugin.name);

    expect(pluginNames).toEqual(expect.arrayContaining(["sentry-vite-plugin"]));
  });

  it("returns an array of Vite pluginswhen unplugin returns a single plugin", () => {
    const plugins = sentryVitePlugin({
      authToken: "test-token",
      org: "test-org",
      project: "test-project",
      disable: true, // This causes unplugin to return only the noop plugin
    });

    expect(Array.isArray(plugins)).toBe(true);
    expect(plugins.length).toBeGreaterThanOrEqual(1);
    expect(plugins[0]).toHaveProperty("name");
  });
});
