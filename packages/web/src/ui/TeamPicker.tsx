import { css } from "styled-system/css";
import type { Team } from "../types";
import { Icon } from "./Icon";

type Props = { teams: Team[]; value: number | null; onChange: (teamId: number) => void };

const picker = css({
  bg: "ink",
  color: "paper",
  p: { base: "20px", mdDown: "16px" },
  display: "grid",
  gridTemplateColumns: { base: "100px 1fr", mdDown: "1fr" },
  alignItems: "center",
  gap: { base: "18px", mdDown: "8px" },
  fontWeight: 700,
  mb: "24px",
});

const selectWrap = css({
  position: "relative",
  "& select": {
    width: "100%",
    height: "48px",
    appearance: "none",
    border: 0,
    bg: "paper",
    color: "ink",
    pr: "44px",
    pl: "15px",
    fontWeight: 700,
  },
  "& svg": {
    position: "absolute",
    right: "14px",
    top: "15px",
    pointerEvents: "none",
    color: "ink",
  },
});

export function TeamPicker({ teams, value, onChange }: Props) {
  return (
    <label className={picker}>
      <span>Team</span>
      <div className={selectWrap}>
        <select value={value ?? ""} onChange={(e) => onChange(Number(e.target.value))}>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <Icon name="chevron" />
      </div>
    </label>
  );
}
