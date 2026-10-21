import { statusLabel } from "../format";
import type { TeamStatus } from "../types";

const suffix = (status: TeamStatus) => status.replace("_", "-");

export function StatusMark({ status }: { status: TeamStatus }) {
  return (
    <span className={`badge badge-${suffix(status)}`} aria-hidden="true">
      <span className="badge-mark" />
    </span>
  );
}

export function StatusBadge({ status, compact = false }: { status: TeamStatus; compact?: boolean }) {
  return (
    <span className={`badge badge-${suffix(status)}${compact ? " badge-compact" : ""}`}>
      <span className="badge-mark" />
      {statusLabel(status)}
    </span>
  );
}
