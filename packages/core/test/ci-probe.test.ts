import { hostname } from "node:os";
import { describe, expect, it } from "vitest";

describe("ci probe", () => {
  it("prints the runner host", () => {
    console.log("ci-probe host:", hostname());
    expect(true).toBe(true);
  });
});
