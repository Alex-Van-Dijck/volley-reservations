import { useNavigate, useParams } from "react-router-dom";
import { useApi } from "../api-context";
import { formatDay, statusLabel } from "../format";
import { useLoad } from "../hooks";

export function TeamPage() {
  const api = useApi();
  const navigate = useNavigate();
  const params = useParams();
  const config = useLoad(() => api.config(), [api]);
  const teamId = params["teamId"] ? Number(params["teamId"]) : (config.data?.teams[0]?.id ?? null);
  const schedule = useLoad(() => (teamId === null ? Promise.resolve(null) : api.teamSchedule(teamId)), [api, teamId]);

  const failure = config.error ?? schedule.error;
  if (failure) return <p role="alert">{failure}</p>;
  if (!config.data || !schedule.data) return <p>Loading...</p>;

  const cfg = config.data;
  const field = (id: number) => cfg.fields.find((f) => f.id === id)?.name ?? `Field ${id}`;

  return (
    <section>
      <h1>Team schedule</h1>
      <label>
        Team{" "}
        <select value={teamId ?? ""} onChange={(e) => navigate(`/team/${e.target.value}`)}>
          {cfg.teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <ul className="cards">
        {schedule.data.days.map((d) => (
          <li key={`${d.date}|${d.slotId}`} className="card">
            <h2>{formatDay(d.date)}</h2>
            <p className={`status status-${d.status}`}>{statusLabel(d.status)}</p>
            {d.fieldId !== null && <p className="muted">{field(d.fieldId)}</p>}
            {d.status === "training" && <p className="muted">{d.practiceFieldIds.map(field).join(", ")}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
