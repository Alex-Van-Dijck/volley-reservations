const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function DateBlock({ date }: { date: string }) {
  const d = new Date(`${date}T00:00:00Z`);
  return (
    <div className="event-date" aria-hidden="true">
      <b>{d.getUTCDate()}</b>
      <span>{MONTHS[d.getUTCMonth()]}</span>
    </div>
  );
}
