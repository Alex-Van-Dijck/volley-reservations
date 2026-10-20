import { useApi } from "../api-context";
import { formatDay, formatSlot } from "../format";
import { useLoad } from "../hooks";

export function CalendarPage() {
  const api = useApi();
  const config = useLoad(() => api.config(), [api]);
  const calendar = useLoad(() => api.calendar(), [api]);

  const failure = config.error ?? calendar.error;
  if (failure) return <p role="alert">{failure}</p>;
  if (!config.data || !calendar.data) return <p>Loading...</p>;

  const cfg = config.data;
  const team = (id: number) => cfg.teams.find((t) => t.id === id)?.name ?? `Team ${id}`;
  const field = (id: number) => cfg.fields.find((f) => f.id === id)?.name ?? `Field ${id}`;
  const slotOf = (id: number) => cfg.slots.find((s) => s.id === id);

  return (
    <section>
      <h1>Club calendar</h1>
      <ul className="cards">
        {calendar.data.days.map((day) => (
          <li key={day.date} className="card">
            <h2>{formatDay(day.date)}</h2>
            {day.slots.map((s) => (
              <div key={s.slotId} className="slot">
                <p className="muted">{slotOf(s.slotId) ? formatSlot(slotOf(s.slotId)!) : ""}</p>
                {s.blocked && <p className="blocked">{s.blockReason ? `Blocked: ${s.blockReason}` : "Blocked"}</p>}
                {s.homeGames.map((g) => (
                  <p key={g.eventId}>{`${team(g.teamId)} on ${field(g.fieldId)}`}</p>
                ))}
                {s.awayGames.map((g) => (
                  <p key={g.eventId} className="muted">{`${team(g.teamId)} away`}</p>
                ))}
                {!s.blocked && (
                  <p className="practice">
                    {s.practiceFieldIds.length > 0
                      ? `Free to practice: ${s.practiceFieldIds.map(field).join(", ")}`
                      : "No free field"}
                  </p>
                )}
              </div>
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}
