import { badge } from "styled-system/recipes";
import { statusLabel } from "../format";
import type { TeamStatus } from "../types";

export function StatusMark({ status }: { status: TeamStatus }) {
  const slots = badge({ status });
  return (
    <span className={slots.root} data-status={status} aria-hidden="true">
      <span className={slots.mark} />
    </span>
  );
}

export function StatusBadge({ status, compact = false }: { status: TeamStatus; compact?: boolean }) {
  const slots = badge({ status, compact });
  return (
    <span className={slots.root} data-status={status} data-compact={compact || undefined}>
      <span className={slots.mark} />
      {statusLabel(status)}
    </span>
  );
}
