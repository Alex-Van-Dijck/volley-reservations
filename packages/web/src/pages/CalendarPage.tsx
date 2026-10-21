import { useState } from "react";
import { css } from "styled-system/css";
import { calendarDay, dot, fieldSection } from "styled-system/recipes";
import { useApi } from "../api-context";
import { fieldName, formatDay, formatMonth, monthName, slotTime, statusLabel, teamName } from "../format";
import { useLoad } from "../hooks";
import type { CalendarDay, CalendarSlot, Config, TeamStatus } from "../types";
import { DateBlock } from "../ui/DateBlock";
import { ErrorBanner } from "../ui/ErrorBanner";
import { Legend } from "../ui/Legend";
import { PageIntro } from "../ui/PageIntro";
import { StatusBadge, StatusMark } from "../ui/StatusBadge";

const WEEKDAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

const monthSwitcher = css({
  height: "46px",
  layerStyle: "card",
  display: "flex",
  alignItems: "center",
  mdDown: { mt: "20px", width: "fit-content" },
  "& button": {
    height: "100%",
    width: "44px",
    border: 0,
    bg: "transparent",
    color: "ink",
    fontSize: "24px",
    _disabled: { color: "muted", opacity: 0.4, cursor: "default" },
  },
  "& span": { px: "12px", fontWeight: 700, minWidth: "90px", textAlign: "center" },
});

const panel = css({
  layerStyle: "card",
  p: { base: "24px", mdDown: "12px" },
});

const gridColumns = {
  display: "grid",
  gridTemplateColumns: "repeat(7, 1fr)",
  gap: { base: "7px", mdDown: "3px" },
} as const;

const weekdays = css(gridColumns, {
  "& span": { textAlign: "center", fontSize: "11px", color: "muted", fontWeight: 700, pb: "8px" },
});

const grid = css(gridColumns);

const selectedPanel = css({
  mt: "18px",
  border: "1px solid",
  borderColor: "ink",
  p: { base: "22px", mdDown: "16px 10px" },
  display: "grid",
  gridTemplateColumns: { base: "64px 1fr", mdDown: "46px 1fr" },
  alignItems: "start",
  gap: { base: "22px", mdDown: "12px" },
  "&[data-blocked]": { borderColor: "crimson" },
});

const detailHead = css({ display: "flex", alignItems: "center", gap: "10px", mb: "8px" });

const detailTitle = css({ fontSize: { base: "22px", mdDown: "17px" }, mb: "8px" });

const slot = css({ "& + &": { mt: "14px" } });

const slotTimeText = css({ fontSize: "12px", fontWeight: 700, letterSpacing: "0.04em" });

const slotLine = css({
  display: "flex",
  alignItems: "flex-start",
  gap: "8px",
  mt: "6px",
  "& > span": { mt: "4px" },
  "& p": { textStyle: "small", color: "ink" },
});

const slotNote = css({ textStyle: "small", color: "crimson", mt: "6px" });

const fieldStrip = css({
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  aspectRatio: "2 / 1",
  maxWidth: "480px",
  gap: "4px",
  mt: "6px",
  p: "4px",
  bg: "paper",
  border: "2px solid",
  borderColor: "ink",
});

const mobileBreak = css({ display: { base: "none", mdDown: "inline" } });

function dayStatus(day: CalendarDay): TeamStatus {
  if (day.slots.some((s) => s.blocked)) return "unavailable";
  if (day.slots.some((s) => s.homeGames.length > 0)) return "home";
  if (day.slots.some((s) => s.awayGames.length > 0)) return "away";
  if (day.slots.some((s) => s.practiceFieldIds.length > 0)) return "training";
  return "no_training";
}

const FIELD_SECTIONS = 3;

type FieldState = "blocked" | "home" | "training" | "unavailable";

function fieldState(
  slot: CalendarSlot,
  config: Config,
  fieldId: number,
): { state: FieldState; label: string; name: string } {
  const name = fieldName(config, fieldId);
  if (slot.blocked) return { state: "blocked", label: "Blocked", name };
  const home = slot.homeGames.find((g) => g.fieldId === fieldId);
  if (home) return { state: "home", label: teamName(config, home.teamId), name };
  if (slot.practiceFieldIds.includes(fieldId)) return { state: "training", label: "Free to practice", name };
  return { state: "unavailable", label: "Not available", name };
}

function breakAfterFirstWord(label: string) {
  const space = label.indexOf(" ");
  if (space === -1) return label;
  return (
    <>
      {label.slice(0, space + 1)}
      <br className={mobileBreak} />
      {label.slice(space + 1)}
    </>
  );
}

function SlotLines({ slot: calSlot, config }: { slot: CalendarSlot; config: Config }) {
  const sections = config.fields
    .slice(0, FIELD_SECTIONS - 1)
    .map((f) => ({ id: f.id, ...fieldState(calSlot, config, f.id) }));
  const spare = FIELD_SECTIONS - sections.length;

  return (
    <>
      <div className={fieldStrip}>
        {sections.map((s) => {
          const parts = fieldSection({ state: s.state });
          return (
            <div key={s.id} className={parts.root}>
              <span className={parts.name}>{s.name}</span>
              <strong className={parts.label}>{breakAfterFirstWord(s.label)}</strong>
            </div>
          );
        })}
        {Array.from({ length: spare }, (_, i) => (
          <div key={`spare-${i}`} className={fieldSection({ state: "spare" }).root} aria-hidden="true" />
        ))}
      </div>
      {calSlot.blocked && calSlot.blockReason && <p className={slotNote}>{`Blocked: ${calSlot.blockReason}`}</p>}
      {calSlot.awayGames.map((g) => (
        <div key={g.eventId} className={slotLine}>
          <StatusMark status="away" />
          <p>{`${teamName(config, g.teamId)} away`}</p>
        </div>
      ))}
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

  const byDate = new Map(days.map((d) => [d.date, d]));
  const selected = (picked ? byDate.get(picked) : undefined) ?? days.find((d) => d.date >= cfg.today) ?? firstDay;
  const selectedDate = selected.date;
  const selectedStatus = dayStatus(selected);

  const monthKey = selectedDate.slice(0, 7);
  const months = [...new Set(days.map((d) => d.date.slice(0, 7)))].sort();
  const monthIndex = months.indexOf(monthKey);
  const goToMonth = (key: string | undefined) => {
    const first = key ? days.find((d) => d.date.startsWith(key)) : undefined;
    if (first) setPicked(first.date);
  };

  return (
    <section>
      <PageIntro
        eyebrow="Club calendar"
        title={formatMonth(monthKey)}
        action={
          <div className={monthSwitcher}>
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
      <div className={panel}>
        <div className={weekdays} aria-hidden="true">
          {WEEKDAY_LETTERS.map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        <div className={grid}>
          {monthCells(monthKey).map((date, i) => {
            if (!date) return <span key={i} className={calendarDay({ blank: true })} />;
            const day = byDate.get(date);
            const dayNumber = Number(date.slice(8, 10));
            if (!day) {
              return (
                <button
                  key={date}
                  type="button"
                  disabled
                  className={calendarDay({ today: date === cfg.today })}
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
                className={calendarDay({ selected: date === selectedDate, today: date === cfg.today })}
                aria-pressed={date === selectedDate}
                aria-label={`${formatDay(date)}, ${statusLabel(status)}`}
                onClick={() => setPicked(date)}
              >
                <span>{dayNumber}</span>
                <i className={dot({ status })} />
              </button>
            );
          })}
        </div>
        <section
          className={selectedPanel}
          data-blocked={selected.slots.some((s) => s.blocked) || undefined}
          aria-label="Selected day"
        >
          <DateBlock date={selected.date} style={{ alignSelf: "stretch" }} />
          <div>
            <div className={detailHead}>
              <StatusBadge status={selectedStatus} compact />
            </div>
            <h2 className={detailTitle}>{formatDay(selected.date)}</h2>
            {selected.slots.map((s) => (
              <div key={s.slotId} className={slot}>
                <p className={slotTimeText}>{slotTime(cfg, s.slotId)}</p>
                <SlotLines slot={s} config={cfg} />
              </div>
            ))}
          </div>
        </section>
      </div>
      <Legend />
    </section>
  );
}
