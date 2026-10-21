import type { TeamStatus } from "../types";
import { StatusBadge } from "./StatusBadge";

const STATUSES: TeamStatus[] = ["home", "away", "unavailable", "training", "no_training"];

export function Legend() {
  return (
    <div className="legend" role="group" aria-label="Status legend">
      {STATUSES.map((s) => (
        <StatusBadge key={s} status={s} compact />
      ))}
    </div>
  );
}
