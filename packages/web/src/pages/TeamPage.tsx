import { useNavigate, useParams } from "react-router-dom";
import { useApi } from "../api-context";
import { formatDay } from "../format";
import { useLoad } from "../hooks";
import { DateBlock } from "../ui/DateBlock";
import { ErrorBanner } from "../ui/ErrorBanner";
import { Icon } from "../ui/Icon";
import { PageIntro } from "../ui/PageIntro";
import { StatusBadge } from "../ui/StatusBadge";

export function TeamPage() {
  const api = useApi();
  const navigate = useNavigate();
  const params = useParams();
  const config = useLoad(() => api.config(), [api]);
  const teamId = params["teamId"] ? Number(params["teamId"]) : (config.data?.teams[0]?.id ?? null);
  const schedule = useLoad(() => (teamId === null ? Promise.resolve(null) : api.teamSchedule(teamId)), [api, teamId]);

  const failure = config.error ?? schedule.error;
  if (failure) return <ErrorBanner message={failure} />;
  if (!config.data || !schedule.data) return <p>Loading...</p>;

  const cfg = config.data;
  const field = (id: number) => cfg.fields.find((f) => f.id === id)?.name ?? `Field ${id}`;
  const teamName = cfg.teams.find((t) => t.id === teamId)?.name ?? `Team ${teamId}`;

  return (
    <section>
      <PageIntro
        eyebrow="Teams"
        title="Team schedule"
      />
      <label className="team-picker">
        <span>Team</span>
        <div className="select-wrap">
          <select value={teamId ?? ""} onChange={(e) => navigate(`/team/${e.target.value}`)}>
            {cfg.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <Icon name="chevron" />
        </div>
      </label>
      <div className="section-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Season</span>
            <h2>{teamName}</h2>
          </div>
          <span className="count-pill">{`${schedule.data.days.length} dates`}</span>
        </div>
        <ul className="schedule-list">
          {schedule.data.days.map((d) => (
            <li key={`${d.date}|${d.slotId}`} className="schedule-card">
              <DateBlock date={d.date} />
              <div className="schedule-copy">
                <StatusBadge status={d.status} compact />
                <h3>{formatDay(d.date)}</h3>
                {d.fieldId !== null && <p>{field(d.fieldId)}</p>}
                {d.status === "training" && <p>{d.practiceFieldIds.map(field).join(", ")}</p>}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
