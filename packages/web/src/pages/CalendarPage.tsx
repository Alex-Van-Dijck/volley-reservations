import { useApi } from "../api-context";
import { formatDay, formatSlot } from "../format";
import { useLoad } from "../hooks";
import { DateBlock } from "../ui/DateBlock";
import { ErrorBanner } from "../ui/ErrorBanner";
import { Legend } from "../ui/Legend";
import { PageIntro } from "../ui/PageIntro";
import { StatusMark } from "../ui/StatusBadge";

export function CalendarPage() {
  const api = useApi();
  const config = useLoad(() => api.config(), [api]);
  const calendar = useLoad(() => api.calendar(), [api]);

  const failure = config.error ?? calendar.error;
  if (failure) return <ErrorBanner message={failure} />;
  if (!config.data || !calendar.data) return <p>Loading...</p>;

  const cfg = config.data;
  const team = (id: number) =>
    cfg.teams.find((t) => t.id === id)?.name ?? `Team ${id}`;
  const field = (id: number) =>
    cfg.fields.find((f) => f.id === id)?.name ?? `Field ${id}`;
  const slotOf = (id: number) => cfg.slots.find((s) => s.id === id);

  return (
    <section>
      <PageIntro eyebrow="Fields and practice" title="Club calendar" />
      <Legend />
      <ul className="event-grid">
        {calendar.data.days.map((day) => (
          <li
            key={day.date}
            className={`event-card${day.slots.some((s) => s.blocked) ? " is-blocked" : ""}`}
          >
            <DateBlock date={day.date} />
            <div>
              <h2>{formatDay(day.date)}</h2>
              {day.slots.map((s) => (
                <div key={s.slotId} className="slot">
                  <p className="slot-time">
                    {slotOf(s.slotId) ? formatSlot(slotOf(s.slotId)!) : ""}
                  </p>
                  {s.blocked && (
                    <div className="slot-line">
                      <StatusMark status="unavailable" />
                      <p>
                        {s.blockReason
                          ? `Blocked: ${s.blockReason}`
                          : "Blocked"}
                      </p>
                    </div>
                  )}
                  {s.homeGames.map((g) => (
                    <div key={g.eventId} className="slot-line">
                      <StatusMark status="home" />
                      <p>{`${team(g.teamId)} on ${field(g.fieldId)}`}</p>
                    </div>
                  ))}
                  {s.awayGames.map((g) => (
                    <div key={g.eventId} className="slot-line">
                      <StatusMark status="away" />
                      <p>{`${team(g.teamId)} away`}</p>
                    </div>
                  ))}
                  {!s.blocked && (
                    <div className="slot-line">
                      <StatusMark
                        status={
                          s.practiceFieldIds.length > 0
                            ? "training"
                            : "no_training"
                        }
                      />
                      <p>
                        {s.practiceFieldIds.length > 0
                          ? `Free to practice: ${s.practiceFieldIds.map(field).join(", ")}`
                          : "No free field"}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
