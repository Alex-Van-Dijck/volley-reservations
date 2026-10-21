import type { CalendarDay, Config, EventView, NewEventInput, TeamSchedule, User } from "./types";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, detail: string) {
    super(detail);
    this.status = status;
    this.code = code;
  }
}

export type Api = {
  config(): Promise<Config>;
  calendar(range?: { from?: string; to?: string }): Promise<{ days: CalendarDay[] }>;
  teamSchedule(teamId: number, range?: { from?: string; to?: string }): Promise<TeamSchedule>;
  login(username: string, password: string): Promise<User>;
  logout(): Promise<void>;
  me(): Promise<User | null>;
  createEvent(input: NewEventInput): Promise<EventView>;
  cancelEvent(id: string): Promise<void>;
  moveEvent(id: string, target: { date: string; slotId: number; fieldId: number | null }): Promise<EventView>;
  blockSlot(date: string, slotId: number, reason?: string): Promise<void>;
  unblockSlot(date: string, slotId: number): Promise<void>;
};

function query(range?: { from?: string; to?: string }): string {
  const params = new URLSearchParams();
  if (range?.from) params.set("from", range.from);
  if (range?.to) params.set("to", range.to);
  const text = params.toString();
  return text ? `?${text}` : "";
}

export function createApi(fetchImpl: typeof fetch = (input, init) => fetch(input, init)): Api {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetchImpl(path, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 204) return undefined as T;
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(res.status, data?.code ?? "INTERNAL", data?.detail ?? res.statusText);
    return data as T;
  }

  return {
    config: () => request("GET", "/api/config"),
    calendar: (range) => request("GET", `/api/calendar${query(range)}`),
    teamSchedule: (teamId, range) => request("GET", `/api/teams/${teamId}/schedule${query(range)}`),
    login: (username, password) => request("POST", "/api/auth/login", { username, password }),
    logout: () => request("POST", "/api/auth/logout"),
    me: async () => {
      try {
        return await request<User>("GET", "/api/auth/me");
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    createEvent: (input) => request("POST", "/api/events", input),
    cancelEvent: (id) => request("DELETE", `/api/events/${id}`),
    moveEvent: (id, target) => request("POST", `/api/events/${id}/move`, target),
    blockSlot: (date, slotId, reason) =>
      request("PUT", `/api/blocks/${date}/${slotId}`, reason === undefined ? undefined : { reason }),
    unblockSlot: (date, slotId) => request("DELETE", `/api/blocks/${date}/${slotId}`),
  };
}
