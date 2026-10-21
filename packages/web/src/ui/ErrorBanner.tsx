import { css } from "styled-system/css";
import { Icon } from "./Icon";

const banner = css({
  display: "flex",
  gap: "12px",
  bg: "crimsonDark",
  color: "white",
  p: "13px",
  mb: "18px",
  "& svg": { flex: "none" },
});

const text = css({ display: "block", textStyle: "small" });

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className={banner} role="alert">
      <Icon name="alert" />
      <span className={text}>{message}</span>
    </div>
  );
}
