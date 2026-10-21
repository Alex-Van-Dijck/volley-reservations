import { useState } from "react";
import { Navigate } from "react-router-dom";
import { css } from "styled-system/css";
import { useApi } from "../api-context";
import { useAuth } from "../auth-context";
import { teamName } from "../format";
import { useAction, useLoad } from "../hooks";
import type { User } from "../types";
import { ErrorBanner } from "../ui/ErrorBanner";
import { Eyebrow } from "../ui/Eyebrow";
import { PageIntro } from "../ui/PageIntro";
import { TeamPicker } from "../ui/TeamPicker";
import { BlockPanel } from "./BlockPanel";
import { ReservationRow } from "./ReservationRow";

const managerPill = css({
  layerStyle: "card",
  textStyle: "pill",
  py: "8px",
  px: "12px",
});

const pickerSpacing = css({ mb: "24px" });

const block = css({ layerStyle: "card" });

const blockHead = css({
  p: { base: "24px", mdDown: "18px" },
  borderBottom: "1px solid",
  borderColor: "line",
  "& h2": { m: 0, fontSize: "24px" },
});

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
  const { days, openSlots } = schedule.data;
  const bookedDates = new Set(days.filter((d) => d.eventId !== null).map((d) => d.date));

  return (
    <section>
      <PageIntro
        eyebrow="Reservations"
        title="Manage"
        action={isManager ? <span className={managerPill}>Manager access</span> : undefined}
      />
      {isManager && (
        <div className={pickerSpacing}>
          <TeamPicker teams={cfg.teams} value={teamId} onChange={setPicked} />
        </div>
      )}
      {action.error && <ErrorBanner message={action.error} />}
      <div className={block}>
        <div className={blockHead}>
          <Eyebrow>{teamName(cfg, teamId)}</Eyebrow>
          <h2>Field reservations</h2>
        </div>
        <ul>
          {days.map((day) => (
            <ReservationRow
              key={`${teamId}|${day.date}|${day.slotId}`}
              day={day}
              teamId={teamId}
              config={cfg}
              dates={days
                .filter((d) => d.slotId === day.slotId && (d.date === day.date || d.eventId === null))
                .map((d) => d.date)}
              openSlots={openSlots.filter(
                (s) => s.slotId === day.slotId && (s.date === day.date || !bookedDates.has(s.date)),
              )}
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
