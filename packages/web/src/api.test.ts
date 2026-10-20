import { describe, expect, it, vi } from "vitest";
import { ApiError, createApi } from "./api";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("createApi", () => {
  it("sends a JSON content type only when there is a body", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(json(200, { teams: [] })).mockResolvedValueOnce(json(200, {}));
    const api = createApi(fetchImpl);
    await api.config();
    await api.login("a", "b");
    expect(fetchImpl.mock.calls[0]![1].headers).toBeUndefined();
    expect(fetchImpl.mock.calls[1]![1].headers).toEqual({ "content-type": "application/json" });
    expect(fetchImpl.mock.calls[1]![1].body).toBe(JSON.stringify({ username: "a", password: "b" }));
  });

  it("resolves void on 204", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await expect(createApi(fetchImpl).cancelEvent("e1")).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledWith("/api/events/e1", expect.objectContaining({ method: "DELETE" }));
  });

  it("turns problem responses into ApiError", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(409, { code: "FIELD_TAKEN", detail: "taken" }));
    const error = await createApi(fetchImpl).config().catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: "FIELD_TAKEN", message: "taken" });
  });

  it("returns null from me() on 401 but rethrows other errors", async () => {
    const unauth = vi.fn().mockResolvedValue(json(401, { code: "UNAUTHENTICATED", detail: "no" }));
    await expect(createApi(unauth).me()).resolves.toBeNull();
    const broken = vi.fn().mockResolvedValue(json(500, { code: "INTERNAL", detail: "boom" }));
    await expect(createApi(broken).me()).rejects.toBeInstanceOf(ApiError);
  });

  it("builds range queries and block requests", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(200, { days: [] }));
    const api = createApi(fetchImpl);
    await api.calendar({ from: "2026-10-22", to: "2026-11-05" });
    expect(fetchImpl.mock.calls[0]![0]).toBe("/api/calendar?from=2026-10-22&to=2026-11-05");
    await api.blockSlot("2026-10-22", 1);
    expect(fetchImpl.mock.calls[1]![0]).toBe("/api/blocks/2026-10-22/1");
    expect(fetchImpl.mock.calls[1]![1].body).toBeUndefined();
    await api.blockSlot("2026-10-22", 1, "Hall closed");
    expect(fetchImpl.mock.calls[2]![1].body).toBe(JSON.stringify({ reason: "Hall closed" }));
  });
});
