import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";
import type { Api } from "./api";
import { ApiProvider } from "./api-context";
import { AuthProvider } from "./auth-context";
import type { CalendarDay, Config, TeamSchedule, User } from "./types";

export const config: Config = {
  teams: [1, 2, 3, 4].map((id) => ({ id, name: `Team ${id}` })),
  fields: [
    { id: 1, name: "Field 1", size: "big" },
    { id: 2, name: "Field 2", size: "small" },
  ],
  slots: [{ id: 1, weekday: 4, start: "20:00", end: "22:00" }],
  seasonEnd: "2027-05-27",
  today: "2026-10-20",
  timezone: "Europe/Brussels",
};

export const calendar: { days: CalendarDay[] } = {
  days: [
    {
      date: "2026-10-22",
      slots: [
        {
          slotId: 1,
          blocked: false,
          blockReason: null,
          homeGames: [{ eventId: "e1", teamId: 1, fieldId: 1 }],
          awayGames: [{ eventId: "e2", teamId: 2 }],
          practiceFieldIds: [2],
        },
      ],
    },
    {
      date: "2026-10-29",
      slots: [
        { slotId: 1, blocked: true, blockReason: "Tournament", homeGames: [], awayGames: [], practiceFieldIds: [] },
      ],
    },
    {
      date: "2026-11-05",
      slots: [
        { slotId: 1, blocked: false, blockReason: null, homeGames: [], awayGames: [], practiceFieldIds: [1, 2] },
      ],
    },
  ],
};

export const schedule: TeamSchedule = {
  teamId: 1,
  days: [
    { date: "2026-10-22", slotId: 1, status: "home", eventId: "e1", fieldId: 1, practiceFieldIds: [2] },
    { date: "2026-10-29", slotId: 1, status: "unavailable", eventId: null, fieldId: null, practiceFieldIds: [] },
    { date: "2026-11-05", slotId: 1, status: "training", eventId: null, fieldId: null, practiceFieldIds: [1, 2] },
  ],
  openSlots: [
    { date: "2026-10-22", slotId: 1, fieldIds: [1, 2] },
    { date: "2026-11-05", slotId: 1, fieldIds: [1, 2] },
  ],
};

export const captain: User = { id: "u1", username: "captain1", role: "captain", teamId: 1 };
export const manager: User = { id: "u2", username: "manager", role: "manager", teamId: null };

export function makeApi(overrides: Partial<Api> = {}): Api {
  return {
    config: vi.fn().mockResolvedValue(config),
    calendar: vi.fn().mockResolvedValue(calendar),
    teamSchedule: vi.fn().mockResolvedValue(schedule),
    login: vi.fn().mockResolvedValue(captain),
    logout: vi.fn().mockResolvedValue(undefined),
    me: vi.fn().mockResolvedValue(null),
    createEvent: vi.fn().mockResolvedValue({}),
    cancelEvent: vi.fn().mockResolvedValue(undefined),
    moveEvent: vi.fn().mockResolvedValue({}),
    blockSlot: vi.fn().mockResolvedValue(undefined),
    unblockSlot: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

export function renderWithApp(
  ui: ReactElement,
  opts: { api?: Api; route?: string; path?: string } = {},
) {
  const api = opts.api ?? makeApi();
  const view = render(
    <ApiProvider api={api}>
      <AuthProvider>
        <MemoryRouter initialEntries={[opts.route ?? "/"]}>
          <Routes>
            <Route path={opts.path ?? "*"} element={ui} />
            <Route path="/login" element={<p>login page</p>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </ApiProvider>,
  );
  return { api, ...view };
}
