import { useState } from "react";
import { useApi } from "../api-context";
import { formatDay, formatMonth, formatSlot, monthName, statusLabel } from "../format";
import { useLoad } from "../hooks";
import type { CalendarDay, CalendarSlot, TeamStatus } from "../types";
import { DateBlock } from "../ui/DateBlock";
import { ErrorBanner } from "../ui/ErrorBanner";
import { Legend } from "../ui/Legend";
import { PageIntro } from "../ui/PageIntro";
import { StatusBadge, StatusMark } from "../ui/StatusBadge";

const WEEKDAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

function dayStatus(day: CalendarDay): TeamStatus {
  if (day.slots.some((s) => s.blocked)) return "unavailable";
  if (day.slots.some((s) => s.homeGames.length > 0)) return "home";
  if (day.slots.some((s) => s.awayGames.length > 0)) return "away";
  if (day.slots.some((s) => s.practiceFieldIds.length > 0)) return "training";
  return "no_training";
}

const statusSuffix = (status: TeamStatus) => status.replace("_", "-");

type Lookup = { team: (id: number) => string; field: (id: number) => string };

function SlotLines({ slot, lookup }: { slot: CalendarSlot; lookup: Lookup }) {
  return (
    <>
      {slot.blocked && (
        <div className="slot-line">
          <StatusMark status="unavailable" />
          <p>{slot.blockReason ? `Blocked: ${slot.blockReason}` : "Blocked"}</p>
        </div>
      )}
      {slot.homeGames.map((g) => (
        <div key={g.eventId} className="slot-line">
          <StatusMark status="home" />
          <p>{`${lookup.team(g.teamId)} on ${lookup.field(g.fieldId)}`}</p>
        </div>
      ))}
      {slot.awayGames.map((g) => (
        <div key={g.eventId} className="slot-line">
          <StatusMark status="away" />
          <p>{`${lookup.team(g.teamId)} away`}</p>
        </div>
      ))}
      {!slot.blocked && (
        <div className="slot-line">
          <StatusMark status={slot.practiceFieldIds.length > 0 ? "training" : "no_training"} />
          <p>
            {slot.practiceFieldIds.length > 0
              ? `Free to practice: ${slot.practiceFieldIds.map(lookup.field).join(", ")}`
              : "No free field"}
          </p>
        </div>
      )}
    </>
  );
}

function monthCells(monthKey: string): (string | null)[] {
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  const lead = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const length = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const total = Math.ceil((lead + length) / 7) * 7;
  return Array.from({ length: total }, (_, i) => {
    const n = i - lead + 1;
    return n >= 1 && n <= length ? `${monthKey}-${String(n).padStart(2, "0")}` : null;
  });
}

export function CalendarPage() {
  const api = useApi();
  const config = useLoad(() => api.config(), [api]);
  const calendar = useLoad(() => api.calendar(), [api]);
  const [picked, setPicked] = useState<string | null>(null);

  const failure = config.error ?? calendar.error;
  if (failure) return <ErrorBanner message={failure} />;
  if (!config.data || !calendar.data) return <p>Loading...</p>;

  const cfg = config.data;
  const days = calendar.data.days;
  const firstDay = days[0];
  if (!firstDay) return <p>No days to show.</p>;

  const lookup: Lookup = {
    team: (id) => cfg.teams.find((t) => t.id === id)?.name ?? `Team ${id}`,
    field: (id) => cfg.fields.find((f) => f.id === id)?.name ?? `Field ${id}`,
  };
  const byDate = new Map(days.map((d) => [d.date, d]));
  const selected = (picked ? byDate.get(picked) : undefined) ?? days.find((d) => d.date >= cfg.today) ?? firstDay;
  const selectedDate = selected.date;
  const selectedStatus = dayStatus(selected);

  const monthKey = selectedDate.slice(0, 7);
  const months = [...new Set(days.map((d) => d.date.slice(0, 7)))].sort();
  const monthIndex = months.indexOf(monthKey);
  const goToMonth = (key: string | undefined) => {
    const first = days.find((d) => key && d.date.startsWith(key));
    if (first) setPicked(first.date);
  };

  return (
    <section>
      <PageIntro
        eyebrow="Club calendar"
        title={formatMonth(monthKey)}
        action={
          <div className="month-switcher">
            <button
              type="button"
              aria-label="Previous month"
              disabled={monthIndex <= 0}
              onClick={() => goToMonth(months[monthIndex - 1])}
            >
              ‹
            </button>
            <span>{monthName(monthKey)}</span>
            <button
              type="button"
              aria-label="Next month"
              disabled={monthIndex >= months.length - 1}
              onClick={() => goToMonth(months[monthIndex + 1])}
            >
              ›
            </button>
          </div>
        }
      />
      <div className="panel calendar-panel">
        <div className="calendar-weekdays" aria-hidden="true">
          {WEEKDAY_LETTERS.map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        <div className="calendar-grid">
          {monthCells(monthKey).map((date, i) => {
            if (!date) return <span key={i} className="calendar-day blank" />;
            const day = byDate.get(date);
            const dayNumber = Number(date.slice(8, 10));
            if (!day) {
              return (
                <button
                  key={date}
                  type="button"
                  disabled
                  className={`calendar-day${date === cfg.today ? " today" : ""}`}
                  aria-label={`${formatDay(date)}, no events`}
                >
                  <span>{dayNumber}</span>
                </button>
              );
            }
            const status = dayStatus(day);
            return (
              <button
                key={date}
                type="button"
                className={`calendar-day${date === selectedDate ? " selected" : ""}${date === cfg.today ? " today" : ""}`}
                aria-pressed={date === selectedDate}
                aria-label={`${formatDay(date)}, ${statusLabel(status)}`}
                onClick={() => setPicked(date)}
              >
                <span>{dayNumber}</span>
                <i className={`dot dot-${statusSuffix(status)}`} />
              </button>
            );
          })}
        </div>
        <section
          className={`selected-date${selected.slots.some((s) => s.blocked) ? " is-blocked" : ""}`}
          aria-label="Selected day"
        >
          <DateBlock date={selected.date} />
          <div className="date-detail">
            <div>
              <StatusBadge status={selectedStatus} compact />
            </div>
            <h2>{formatDay(selected.date)}</h2>
            {selected.slots.map((s) => {
              const slot = cfg.slots.find((x) => x.id === s.slotId);
              return (
                <div key={s.slotId} className="slot">
                  <p className="slot-time">{slot ? formatSlot(slot) : ""}</p>
                  <SlotLines slot={s} lookup={lookup} />
                </div>
              );
            })}
          </div>
        </section>
      </div>
      <Legend />
    </section>
  );
}
