import type { ReactNode } from "react";

type Props = { eyebrow: string; title: string; copy: string; action?: ReactNode };

export function PageIntro({ eyebrow, title, copy, action }: Props) {
  return (
    <div className="page-intro">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{copy}</p>
      </div>
      {action}
    </div>
  );
}
