import type { Team } from "../types";
import { Icon } from "./Icon";

type Props = { teams: Team[]; value: number | null; onChange: (teamId: number) => void };

export function TeamPicker({ teams, value, onChange }: Props) {
  return (
    <label className="team-picker">
      <span>Team</span>
      <div className="select-wrap">
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
