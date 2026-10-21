import { MONTHS } from "../format";

export function DateBlock({ date }: { date: string }) {
  return (
    <div className="event-date" aria-hidden="true">
      <b>{Number(date.slice(8, 10))}</b>
      <span>{MONTHS[Number(date.slice(5, 7)) - 1]?.toUpperCase()}</span>
    </div>
  );
}
