import { useNavigate, useParams } from "react-router-dom";
import { css } from "styled-system/css";
import { useApi } from "../api-context";
import { fieldName, formatDay, slotTime, teamName } from "../format";
import { useLoad } from "../hooks";
import { DateBlock } from "../ui/DateBlock";
import { ErrorBanner } from "../ui/ErrorBanner";
import { Eyebrow } from "../ui/Eyebrow";
import { PageIntro } from "../ui/PageIntro";
import { StatusBadge } from "../ui/StatusBadge";
import { TeamPicker } from "../ui/TeamPicker";

const section = css({ mt: { base: "70px", mdDown: "50px" } });

const heading = css({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "end",
  mb: "20px",
  "& h2": { m: 0 },
});

const countPill = css({
  layerStyle: "card",
  textStyle: "pill",
  py: "8px",
  px: "12px",
});

const list = css({ display: "grid", gap: "8px" });

const card = css({
  p: { base: "20px", mdDown: "16px 12px" },
  layerStyle: "card",
  display: "grid",
  gridTemplateColumns: { base: "70px 1fr", mdDown: "55px 1fr" },
  alignItems: "center",
  gap: { base: "20px", mdDown: "10px" },
  _hover: { borderColor: "ink" },
});

const copy = css({
  "& > span": { mb: "9px" },
  "& h3": { mb: "4px" },
  "& p": { textStyle: "small" },
});

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
      <div className={section}>
        <div className={heading}>
          <div>
            <Eyebrow>Season</Eyebrow>
            <h2>{teamName(cfg, teamId)}</h2>
          </div>
          <span className={countPill}>{`${days.length} dates`}</span>
        </div>
        <ul className={list}>
          {days.map((d) => (
            <li key={`${d.date}|${d.slotId}`} className={card}>
              <DateBlock date={d.date} />
              <div className={copy}>
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
