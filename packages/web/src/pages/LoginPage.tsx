import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../api";
import { useAuth } from "../auth-context";
import { errorMessage } from "../format";
import { ErrorBanner } from "../ui/ErrorBanner";
import { Icon } from "../ui/Icon";

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
    <div className="auth-layout">
      <section className="auth-card">
        <div>
          <span className="eyebrow">Welcome back</span>
          <h1>Sign in</h1>
          <p>Use your club account to continue.</p>
        </div>
        {error && <ErrorBanner message={error} />}
        <form className="login" onSubmit={submit}>
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
          <button className="solid-button full" type="submit">
            Sign in <Icon name="arrow" />
          </button>
        </form>
      </section>
    </div>
  );
}
