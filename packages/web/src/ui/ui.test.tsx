import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DateBlock } from "./DateBlock";
import { ErrorBanner } from "./ErrorBanner";
import { PageIntro } from "./PageIntro";
import { StatusBadge, StatusMark } from "./StatusBadge";

describe("StatusBadge", () => {
  it("shows the app label and maps no_training to the dashed style", () => {
    const { container } = render(<StatusBadge status="no_training" />);
    expect(screen.getByText("No training")).toBeInTheDocument();
    expect(container.querySelector('[data-status="no_training"]')).not.toBeNull();
  });

  it("marks the badge compact on request", () => {
    const { container } = render(<StatusBadge status="home" compact />);
    expect(container.querySelector('[data-status="home"][data-compact]')).not.toBeNull();
  });
});

describe("StatusMark", () => {
  it("is decorative and carries the status", () => {
    const { container } = render(<StatusMark status="away" />);
    const mark = container.firstElementChild!;
    expect(mark).toHaveAttribute("aria-hidden", "true");
    expect(mark).toHaveAttribute("data-status", "away");
  });
});

describe("DateBlock", () => {
  it("shows the day number and upper case month, hidden from assistive tech", () => {
    const { container } = render(<DateBlock date="2026-10-22" />);
    expect(screen.getByText("22")).toBeInTheDocument();
    expect(screen.getByText("OCT")).toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
});

describe("ErrorBanner", () => {
  it("is an alert with the message", () => {
    render(<ErrorBanner message="boom" />);
    expect(screen.getByRole("alert")).toHaveTextContent("boom");
  });
});

describe("PageIntro", () => {
  it("renders eyebrow, level 1 title and action", () => {
    render(<PageIntro eyebrow="Teams" title="Team schedule" action={<button>Go</button>} />);
    expect(screen.getByRole("heading", { level: 1, name: "Team schedule" })).toBeInTheDocument();
    expect(screen.getByText("Teams")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go" })).toBeInTheDocument();
  });
});
