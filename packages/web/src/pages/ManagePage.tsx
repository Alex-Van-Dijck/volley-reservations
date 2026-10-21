import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useApi } from "../api-context";
import { useAuth } from "../auth-context";
import { errorMessage, formatDay } from "../format";
import { useLoad } from "../hooks";
import type { CalendarSlot, Config, TeamDay, User } from "../types";
import { BlockPanel } from "./BlockPanel";
import { DateBlock } from "../ui/DateBlock";
import { ErrorBanner } from "../ui/ErrorBanner";
import { Icon } from "../ui/Icon";
import { PageIntro } from "../ui/PageIntro";
import { StatusBadge } from "../ui/StatusBadge";

export function ManagePage() {
  const { user, loading } = useAuth();
  if (loading) return <p>Loading...</p>;
  if (!user) return <Navigate to="/login" replace />;
  return <ManageTeam user={user} />;
}

function ManageTeam({ user }: { user: User }) {
  const api = useApi();
  const config = useLoad(() => api.config(), [api]);
  const [picked, setPicked] = useState<number | null>(null);
  const teamId = user.role === "captain" ? user.teamId : (picked ?? config.data?.teams[0]?.id ?? null);
  const schedule = useLoad(() => (teamId === null ? Promise.resolve(null) : api.teamSchedule(teamId)), [api, teamId]);
  const calendar = useLoad(() => api.calendar(), [api]);
  const [error, setError] = useState<string | null>(null);

  const failure = config.error ?? schedule.error ?? calendar.error;
  if (failure) return <ErrorBanner message={failure} />;
  if (!config.data || !schedule.data || !calendar.data || teamId === null) return <p>Loading...</p>;

  const cfg = config.data;
  const slotsByKey = new Map(
    calendar.data.days.flatMap((d) => d.slots.map((s) => [`${d.date}|${s.slotId}`, s] as const)),
  );

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      schedule.reload();
      calendar.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const teamName = cfg.teams.find((t) => t.id === teamId)?.name ?? `Team ${teamId}`;

  return (
    <section>
      <PageIntro
        eyebrow="Reservations"
        title="Manage"
        action={user.role === "manager" ? <span className="manager-pill">Manager access</span> : undefined}
      />
      {user.role === "manager" && (
        <label className="team-picker">
          <span>Team</span>
          <div className="select-wrap">
            <select value={teamId} onChange={(e) => setPicked(Number(e.target.value))}>
              {cfg.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <Icon name="chevron" />
          </div>
        </label>
      )}
      {error && <ErrorBanner message={error} />}
      <div className="manager-block">
        <div className="manager-block-head">
          <span className="eyebrow">{teamName}</span>
          <h2>Field reservations</h2>
        </div>
        <ul className="manage-list">
          {schedule.data.days.map((day) => (
            <DayRow
              key={`${teamId}|${day.date}|${day.slotId}`}
              day={day}
              slot={slotsByKey.get(`${day.date}|${day.slotId}`)}
              config={cfg}
              teamId={teamId}
              days={schedule.data!.days}
              run={run}
            />
          ))}
        </ul>
      </div>
      {user.role === "manager" && <BlockPanel days={calendar.data.days} config={cfg} run={run} />}
    </section>
  );
}

type RowProps = {
  day: TeamDay;
  slot: CalendarSlot | undefined;
  config: Config;
  teamId: number;
  days: TeamDay[];
  run: (action: () => Promise<unknown>) => Promise<void>;
};

function DayRow({ day, config, teamId, days, run }: RowProps) {
  const api = useApi();
  const [mode, setMode] = useState<"reserve" | "move" | null>(null);
  const fieldName = (id: number) => config.fields.find((f) => f.id === id)?.name ?? `Field ${id}`;

  const reserveFields = day.practiceFieldIds;
  const [type, setType] = useState<"home" | "away">(reserveFields.length > 0 ? "home" : "away");
  const [reserveField, setReserveField] = useState<number | null>(null);
  const chosenField = reserveField ?? reserveFields[0] ?? null;

  const [moveDate, setMoveDate] = useState(day.date);
  const [moveField, setMoveField] = useState<number | null>(null);
  const chosenMoveField = moveField ?? day.fieldId ?? config.fields[0]?.id ?? null;

  const toggle = (next: "reserve" | "move") => setMode(mode === next ? null : next);

  return (
    <li className="manage-row">
      <DateBlock date={day.date} />
      <div className="manage-copy">
        <StatusBadge status={day.status} compact />
        <h3>{formatDay(day.date)}</h3>
        {day.fieldId !== null && <p>{fieldName(day.fieldId)}</p>}
      </div>
      <div className="row-actions">
        {day.eventId ? (
          <>
            <button
              type="button"
              className="outline-button small"
              aria-label={`Move ${day.date}`}
              onClick={() => toggle("move")}
            >
              Move
            </button>
            <button
              type="button"
              className="danger-button small"
              aria-label={`Cancel ${day.date}`}
              onClick={() => void run(() => api.cancelEvent(day.eventId!))}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            className="solid-button small"
            aria-label={`Reserve ${day.date}`}
            onClick={() => toggle("reserve")}
          >
            Reserve
          </button>
        )}
      </div>
      {mode === "reserve" && (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api.createEvent({
                teamId,
                date: day.date,
                slotId: day.slotId,
                type,
                fieldId: type === "home" ? chosenField : null,
              });
              setMode(null);
            });
          }}
        >
          <label className="field">
            Type
            <select value={type} onChange={(e) => setType(e.target.value as "home" | "away")}>
              <option value="home" disabled={reserveFields.length === 0}>
                Home game
              </option>
              <option value="away">Away game</option>
            </select>
          </label>
          {type === "home" && (
            <label className="field">
              Field
              <select value={chosenField ?? ""} onChange={(e) => setReserveField(Number(e.target.value))}>
                {reserveFields.map((id) => (
                  <option key={id} value={id}>
                    {fieldName(id)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="submit" className="solid-button" aria-label={`Save ${day.date}`}>
            Save
          </button>
        </form>
      )}
      {mode === "move" && (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api.moveEvent(day.eventId!, {
                date: moveDate,
                slotId: day.slotId,
                fieldId: day.status === "home" ? chosenMoveField : null,
              });
              setMode(null);
            });
          }}
        >
          <label className="field">
            New date
            <select value={moveDate} onChange={(e) => setMoveDate(e.target.value)}>
              {days.map((d) => (
                <option key={d.date} value={d.date}>
                  {d.date}
                </option>
              ))}
            </select>
          </label>
          {day.status === "home" && (
            <label className="field">
              New field
              <select value={chosenMoveField ?? ""} onChange={(e) => setMoveField(Number(e.target.value))}>
                {config.fields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="submit" className="solid-button" aria-label={`Save ${day.date}`}>
            Save
          </button>
        </form>
      )}
    </li>
  );
}
