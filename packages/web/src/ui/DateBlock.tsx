import { css } from "styled-system/css";
import type { SystemStyleObject } from "styled-system/types";
import { MONTHS } from "../format";

const day = css({
  display: "block",
  fontFamily: "heading",
  fontWeight: 700,
  fontSize: { base: "32px", mdDown: "25px" },
  lineHeight: 1,
});

const month = css({
  color: "muted",
  fontSize: "10px",
  letterSpacing: "0.14em",
  fontWeight: 800,
});

export function DateBlock({ date, style }: { date: string; style?: SystemStyleObject }) {
  const block = css(
    {
      textAlign: "center",
      borderRight: "1px solid",
      borderColor: "line",
      pr: { base: "20px", mdDown: "10px" },
    },
    style,
  );
  return (
    <div className={block} aria-hidden="true">
      <b className={day}>{Number(date.slice(8, 10))}</b>
      <span className={month}>{MONTHS[Number(date.slice(5, 7)) - 1]?.toUpperCase()}</span>
    </div>
  );
}
