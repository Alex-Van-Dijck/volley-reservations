import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useApi } from "../api-context";
import { useAuth } from "../auth-context";
import { teamName } from "../format";
import { useAction, useLoad } from "../hooks";
import type { User } from "../types";
import { ErrorBanner } from "../ui/ErrorBanner";
import { PageIntro } from "../ui/PageIntro";
import { TeamPicker } from "../ui/TeamPicker";
import { BlockPanel } from "./BlockPanel";
import { ReservationRow } from "./ReservationRow";

export function ManagePage() {
  const { user, loading } = useAuth();
  if (loading) return <p>Loading...</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "captain" && user.teamId === null) {
    return <ErrorBanner message="Your account is not linked to a team yet, ask the manager." />;
  }
  return <ManageTeam user={user} />;
}

function ManageTeam({ user }: { user: User }) {
  const api = useApi();
  const isManager = user.role === "manager";
  const config = useLoad(() => api.config(), [api]);
  const [picked, setPicked] = useState<number | null>(null);
  const teamId = isManager ? (picked ?? config.data?.teams[0]?.id ?? null) : user.teamId;
  const schedule = useLoad(() => (teamId === null ? Promise.resolve(null) : api.teamSchedule(teamId)), [api, teamId]);
  const calendar = useLoad(() => api.calendar(), [api]);
  const action = useAction(() => {
    schedule.reload();
    calendar.reload();
  });

  const failure = config.error ?? schedule.error ?? calendar.error;
  if (failure) return <ErrorBanner message={failure} />;
  if (config.data && config.data.teams.length === 0) return <p>No teams yet.</p>;
  if (!config.data || !calendar.data || teamId === null || schedule.data?.teamId !== teamId) {
    return <p>Loading...</p>;
  }

  const cfg = config.data;
  const days = schedule.data.days;
  const cells = new Map(calendar.data.days.flatMap((d) => d.slots.map((s) => [`${d.date}|${s.slotId}`, s] as const)));

  return (
    <section>
      <PageIntro
        eyebrow="Reservations"
        title="Manage"
        action={isManager ? <span className="manager-pill">Manager access</span> : undefined}
      />
      {isManager && <TeamPicker teams={cfg.teams} value={teamId} onChange={setPicked} />}
      {action.error && <ErrorBanner message={action.error} />}
      <div className="manager-block">
        <div className="manager-block-head">
          <span className="eyebrow">{teamName(cfg, teamId)}</span>
          <h2>Field reservations</h2>
        </div>
        <ul className="manage-list">
          {days.map((day) => (
            <ReservationRow
              key={`${teamId}|${day.date}|${day.slotId}`}
              day={day}
              teamId={teamId}
              config={cfg}
              dates={days.filter((d) => d.slotId === day.slotId).map((d) => d.date)}
              cell={(date) => cells.get(`${date}|${day.slotId}`)}
              run={action.run}
              busy={action.busy}
            />
          ))}
        </ul>
      </div>
      {isManager && <BlockPanel days={calendar.data.days} config={cfg} run={action.run} busy={action.busy} />}
    </section>
  );
}
