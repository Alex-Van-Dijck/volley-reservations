import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { css, cx } from "styled-system/css";
import { button } from "styled-system/recipes";
import { ApiError } from "../api";
import { useAuth } from "../auth-context";
import { errorMessage } from "../format";
import { ErrorBanner } from "../ui/ErrorBanner";
import { Eyebrow } from "../ui/Eyebrow";
import { Icon } from "../ui/Icon";

const layout = css({
  minHeight: { base: "650px", mdDown: 0 },
  display: "grid",
  placeItems: "center",
});

const card = css({
  width: "min(100%, 500px)",
  p: { base: "54px", mdDown: "34px 22px" },
  layerStyle: "card",
  "& > div:first-child": { mb: "28px" },
  "& h1": { fontSize: "clamp(30px, 4vw, 38px)", mb: "10px" },
});

const form = css({
  display: "grid",
  gap: "14px",
  "& label": { display: "grid", gap: "6px", textStyle: "label" },
});

const submitButton = css({ mt: "10px" });

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await login(username, password);
      navigate("/manage");
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === "UNAUTHENTICATED" ? "Invalid username or password." : errorMessage(err),
      );
    }
  }

  return (
    <div className={layout}>
      <section className={card}>
        <div>
          <Eyebrow>Welcome back</Eyebrow>
          <h1>Sign in</h1>
          <p>Use your club account to continue.</p>
        </div>
        {error && <ErrorBanner message={error} />}
        <form className={form} onSubmit={submit}>
          <label>
            Username
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          <button className={cx(button({ full: true }), submitButton)} type="submit">
            Sign in <Icon name="arrow" />
          </button>
        </form>
      </section>
    </div>
  );
}
