import { describe, expect, it, vi } from "vitest";

// @ts-expect-error Vercel API handlers in this repo are JavaScript modules.
import handler from "../../api/health.js";

function mockResponse() {
  const response = {
    status: vi.fn(() => response),
    setHeader: vi.fn(() => response),
    json: vi.fn(() => response)
  };

  return response;
}

describe("health API", () => {
  it("returns the production API health payload", () => {
    const response = mockResponse();

    handler({ method: "GET" }, response);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ ok: true, service: "expense-me-api" });
  });

  it("rejects unsupported methods", () => {
    const response = mockResponse();

    handler({ method: "POST" }, response);

    expect(response.setHeader).toHaveBeenCalledWith("Allow", "GET");
    expect(response.status).toHaveBeenCalledWith(405);
    expect(response.json).toHaveBeenCalledWith({ error: "Method not allowed" });
  });
});
