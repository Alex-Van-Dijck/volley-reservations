import { useNavigate, useParams } from "react-router-dom";
import { useApi } from "../api-context";
import { fieldName, formatDay, slotTime, teamName } from "../format";
import { useLoad } from "../hooks";
import { DateBlock } from "../ui/DateBlock";
import { ErrorBanner } from "../ui/ErrorBanner";
import { PageIntro } from "../ui/PageIntro";
import { StatusBadge } from "../ui/StatusBadge";
import { TeamPicker } from "../ui/TeamPicker";

export function TeamPage() {
  const api = useApi();
  const navigate = useNavigate();
  const { teamId: param } = useParams();
  const config = useLoad(() => api.config(), [api]);
  const teams = config.data?.teams ?? [];
  const teamId = teams.find((t) => String(t.id) === param)?.id ?? teams[0]?.id ?? null;
  const schedule = useLoad(() => (teamId === null ? Promise.resolve(null) : api.teamSchedule(teamId)), [api, teamId]);

  const failure = config.error ?? schedule.error;
  if (failure) return <ErrorBanner message={failure} />;
  if (config.data && teamId === null) return <p>No teams yet.</p>;
  if (!config.data || teamId === null || schedule.data?.teamId !== teamId) return <p>Loading...</p>;

  const cfg = config.data;
  const days = schedule.data.days;
  const showTime = cfg.slots.length > 1;

  return (
    <section>
      <PageIntro eyebrow="Teams" title="Team schedule" />
      <TeamPicker teams={cfg.teams} value={teamId} onChange={(id) => navigate(`/team/${id}`)} />
      <div className="section-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Season</span>
            <h2>{teamName(cfg, teamId)}</h2>
          </div>
          <span className="count-pill">{`${days.length} dates`}</span>
        </div>
        <ul className="schedule-list">
          {days.map((d) => (
            <li key={`${d.date}|${d.slotId}`} className="schedule-card">
              <DateBlock date={d.date} />
              <div className="schedule-copy">
                <StatusBadge status={d.status} compact />
                <h3>{showTime ? `${formatDay(d.date)}, ${slotTime(cfg, d.slotId)}` : formatDay(d.date)}</h3>
                {d.fieldId !== null && <p>{fieldName(cfg, d.fieldId)}</p>}
                {d.status === "training" && <p>{d.practiceFieldIds.map((id) => fieldName(cfg, id)).join(", ")}</p>}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
