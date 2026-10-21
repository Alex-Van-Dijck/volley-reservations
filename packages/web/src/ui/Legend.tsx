import { css } from "styled-system/css";
import type { TeamStatus } from "../types";
import { StatusBadge } from "./StatusBadge";

const STATUSES: TeamStatus[] = ["home", "away", "unavailable", "training", "no_training"];

const legend = css({
  display: "flex",
  gap: { base: "22px", mdDown: "12px 18px" },
  flexWrap: "wrap",
  pt: "17px",
  px: "4px",
});

export function Legend() {
  return (
    <div className={legend} role="group" aria-label="Status legend">
      {STATUSES.map((s) => (
        <StatusBadge key={s} status={s} compact />
      ))}
    </div>
  );
}
