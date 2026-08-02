import { describe, expect, it } from "vitest";
import { createExpressApp } from "./express-server";

describe("createExpressApp", () => {
  it("registers the SPA fallback under Express 5", () => {
    expect(() => createExpressApp("/tmp/cam-study-test")).not.toThrow();
  });
});
