import type { ReactNode } from "react";
import { css } from "styled-system/css";
import { Eyebrow } from "./Eyebrow";

type Props = {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
};

const intro = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "16px",
  mb: "22px",
  md: { flexDirection: "row", justifyContent: "space-between", alignItems: "end", gap: "32px", mb: "28px" },
  "& h1": { mdDown: { fontSize: "42px", maxWidth: "340px" } },
});

export function PageIntro({ eyebrow, title, action }: Props) {
  return (
    <div className={intro}>
      <div>
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1>{title}</h1>
      </div>
      {action}
    </div>
  );
}
