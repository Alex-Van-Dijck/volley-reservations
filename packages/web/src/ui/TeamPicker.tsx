import { css } from "styled-system/css";
import type { Team } from "../types";
import { Eyebrow } from "./Eyebrow";
import { Icon } from "./Icon";

type Props = {
  teams: Team[];
  value: number | null;
  onChange: (teamId: number) => void;
};

const picker = css({
  display: "block",
  width: "100%",
  md: { maxWidth: "320px", alignSelf: "flex-start" },
});

const selectWrap = css({
  position: "relative",
  "& select": {
    width: "100%",
    appearance: "none",
    pr: "44px",
    fontSize: "16px",
    fontWeight: 700,
    cursor: "pointer",
    _hover: { borderColor: "ink" },
  },
  "& svg": {
    position: "absolute",
    right: "14px",
    top: "50%",
    transform: "translateY(-50%)",
    pointerEvents: "none",
    color: "ink",
  },
});

export function TeamPicker({ teams, value, onChange }: Props) {
  return (
    <label className={picker}>
      <div className={selectWrap}>
        <select
          aria-label="Team"
          value={value ?? ""}
          onChange={(e) => onChange(Number(e.target.value))}
        >
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
