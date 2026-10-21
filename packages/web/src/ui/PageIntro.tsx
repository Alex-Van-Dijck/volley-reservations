import type { ReactNode } from "react";
import { css } from "styled-system/css";
import { Eyebrow } from "./Eyebrow";

type Props = {
  eyebrow: string;
  title: string;
  action?: ReactNode;
};

const intro = css({
  display: { base: "flex", mdDown: "block" },
  justifyContent: "space-between",
  alignItems: "end",
  gap: "32px",
  mb: { base: "28px", mdDown: "22px" },
  "& h1": { mdDown: { fontSize: "42px", maxWidth: "340px" } },
});

export function PageIntro({ eyebrow, title, action }: Props) {
  return (
    <div className={intro}>
      <div>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1>{title}</h1>
      </div>
      {action}
    </div>
  );
}
