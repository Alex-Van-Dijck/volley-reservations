import type { ReactNode } from "react";
import { css } from "styled-system/css";
import type { SystemStyleObject } from "styled-system/types";

const base: SystemStyleObject = {
  textStyle: "eyebrow",
  color: "crimson",
  display: "block",
  mb: "10px",
};

export function Eyebrow({ children, style }: { children: ReactNode; style?: SystemStyleObject }) {
  return <span className={css(base, style)}>{children}</span>;
}
