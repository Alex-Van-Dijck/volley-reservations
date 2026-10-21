import { Icon } from "./Icon";

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="error-banner" role="alert">
      <Icon name="alert" />
      <span>{message}</span>
    </div>
  );
}
