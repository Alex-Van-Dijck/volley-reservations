import { useMemo, useState, type ReactNode } from "react"

type View = "calendar" | "team" | "manage" | "signin"
type Status = "home" | "away" | "unavailable" | "training" | "no-training"

const Icon = ({ name, size = 18 }: { name: string size?: number }) => {
  const paths: Record<string, ReactNode> = {
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.37a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.63 15a1.7 1.7 0 0 0-1.56-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.63 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.63h.01A1.7 1.7 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.63a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.37 9v.01A1.7 1.7 0 0 0 20.91 10H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15Z" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" />
      </>
    ),
    moon: <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" />,
    arrow: <path d="m9 18 6-6-6-6" />,
    check: <path d="m5 12 4 4L19 6" />,
    x: <path d="m18 6-12 12M6 6l12 12" />,
    alert: (
      <>
        <path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0Z" />
        <path d="M12 9v4M12 17h.01" />
      </>
    ),
    chevron: <path d="m6 9 6 6 6-6" />,
    logout: (
      <>
        <path d="M10 17l5-5-5-5M15 12H3M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      </>
    ),
  }
  return (
    <svg
      aria-hidden="true"
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  )
}

const statusLabels: Record<Status, string> = {
  home: "Home match",
  away: "Away match",
  unavailable: "Unavailable",
  training: "Training",
  "no-training": "No training",
}

function StatusBadge({
  status,
  compact = false,
}: {
  status: Status
  compact?: boolean
}) {
  return (
    <span className={`badge badge-${status} ${compact ? "badge-compact" : ""}`}>
      <span className="badge-mark" />
      {statusLabels[status]}
    </span>
  )
}

const dates = [
  {
    day: 3,
    weekday: "Mon",
    status: "training" as Status,
    title: "Free practice",
    meta: "18:00–20:00 · Field 1",
  },
  {
    day: 5,
    weekday: "Wed",
    status: "home" as Status,
    title: "Falcons U18 vs. City Spikers",
    meta: "19:30 · Field 1",
  },
  {
    day: 8,
    weekday: "Sat",
    status: "away" as Status,
    title: "Falcons Women at Northside",
    meta: "16:00 · Northside Arena",
  },
  {
    day: 10,
    weekday: "Mon",
    status: "unavailable" as Status,
    title: "Floor maintenance",
    meta: "All day · All fields",
  },
  {
    day: 12,
    weekday: "Wed",
    status: "no-training" as Status,
    title: "No scheduled practice",
    meta: "Field available after 17:00",
  },
  {
    day: 15,
    weekday: "Sat",
    status: "home" as Status,
    title: "Falcons Men vs. Comets",
    meta: "18:00 · Main field",
  },
]

function Brand({ short = false }: { short?: boolean }) {
  return (
    <div className="brand">
      <div className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 48 48">
          <circle
            cx="24"
            cy="24"
            r="21"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
          />
          <path
            d="M9 18c9-1 16 3 20 11M18 8c0 10 5 18 14 23M37 12c-8 5-12 13-11 25"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      </div>
      {!short && (
        <div>
          <strong>VC Falcons</strong>
          <span>Field reservations</span>
        </div>
      )}
    </div>
  )
}

function Header({
  view,
  setView,
  signedIn,
  setSignedIn,
  dark,
  setDark,
}: {
  view: View
  setView: (v: View) => void
  signedIn: boolean
  setSignedIn: (v: boolean) => void
  dark: boolean
  setDark: (v: boolean) => void
}) {
  return (
    <header className="topbar">
      <button
        className="brand-button"
        onClick={() => setView("calendar")}
        aria-label="Go to club calendar"
      >
        <Brand />
      </button>
      <nav className="desktop-nav" aria-label="Main navigation">
        <button
          className={view === "calendar" ? "active" : ""}
          onClick={() => setView("calendar")}
        >
          Calendar
        </button>
        <button
          className={view === "team" ? "active" : ""}
          onClick={() => setView("team")}
        >
          Teams
        </button>
        {signedIn && (
          <button
            className={view === "manage" ? "active" : ""}
            onClick={() => setView("manage")}
          >
            Manage
          </button>
        )}
      </nav>
      <div className="header-actions">
        <button
          className="icon-button"
          onClick={() => setDark(!dark)}
          aria-label={`Switch to ${dark ? "light" : "dark"} mode`}
        >
          <Icon name={dark ? "sun" : "moon"} />
        </button>
        {signedIn ? (
          <button
            className="account-button"
            onClick={() => {
              setSignedIn(false)
              setView("calendar")
            }}
          >
            <span>AM</span>
            <b>Alex</b>
            <Icon name="logout" size={16} />
          </button>
        ) : (
          <button
            className="solid-button small"
            onClick={() => setView("signin")}
          >
            Sign in
          </button>
        )}
      </div>
    </header>
  )
}

function MobileNav({
  view,
  setView,
  signedIn,
}: {
  view: View
  setView: (v: View) => void
  signedIn: boolean
}) {
  const items: { key: View label: string icon: string }[] = [
    { key: "calendar", label: "Calendar", icon: "calendar" },
    { key: "team", label: "Teams", icon: "users" },
    ...(signedIn
      ? [{ key: "manage" as View, label: "Manage", icon: "settings" }]
      : [{ key: "signin" as View, label: "Sign in", icon: "users" }]),
  ]
  return (
    <nav className="mobile-nav" aria-label="Mobile navigation">
      {items.map((item) => (
        <button
          key={item.key}
          className={view === item.key ? "active" : ""}
          onClick={() => setView(item.key)}
        >
          <Icon name={item.icon} size={20} />
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  )
}

function PageIntro({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string
  title: string
  action?: ReactNode
}) {
  return (
    <div className="page-intro">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
      </div>
      {action}
    </div>
  )
}

function Legend() {
  return (
    <div className="legend" aria-label="Status legend">
      {([
        "home",
        "away",
        "unavailable",
        "training",
        "no-training",
      ] as Status[]).map((s) => (
        <StatusBadge key={s} status={s} compact />
      ))}
    </div>
  )
}

function CalendarScreen() {
  const [selected, setSelected] = useState(5)
  const selectedItem = dates.find((d) => d.day === selected)!
  const monthDays = useMemo(
    () =>
      Array.from({ length: 35 }, (_, i) => i - 1).map((n) =>
        n > 0 && n <= 30 ? n : null,
      ),
    [],
  )
  return (
    <main>
      <PageIntro
        eyebrow="Club calendar"
        title="April 2025"
        action={
          <div className="month-switcher">
            <button aria-label="Previous month">‹</button>
            <span>April</span>
            <button aria-label="Next month">›</button>
          </div>
        }
      />
      <section className="panel calendar-panel">
        <div className="calendar-weekdays">
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        <div className="calendar-grid">
          {monthDays.map((day, i) => {
            const info = dates.find((d) => d.day === day)
            return day ? (
              <button
                key={i}
                className={`calendar-day ${
                  selected === day ? "selected" : ""
                } ${day === 2 ? "today" : ""}`}
                onClick={() => info && setSelected(day)}
                aria-label={`${day} April${
                  info ? `, ${info.title}` : ", no events"
                }`}
                disabled={!info}
              >
                <span>{day}</span>
                {info && <i className={`dot dot-${info.status}`} />}
              </button>
            ) : (
              <span className="calendar-day blank" key={i} />
            )
          })}
        </div>
        <div className="selected-date">
          <div className="date-block">
            <b>{selectedItem.day}</b>
            <span>APR</span>
          </div>
          <div className="date-detail">
            <div>
              <StatusBadge status={selectedItem.status} compact />
              <span className="date-weekday">{selectedItem.weekday}</span>
            </div>
            <h2>{selectedItem.title}</h2>
            <p>{selectedItem.meta}</p>
          </div>
          <button className="arrow-button" aria-label="View event details">
            <Icon name="arrow" />
          </button>
        </div>
      </section>
      <Legend />
      <section className="section-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Coming up</span>
            <h2>Next on the court</h2>
          </div>
          <button className="text-button">
            View full schedule <Icon name="arrow" size={16} />
          </button>
        </div>
        <div className="event-grid">
          {dates.slice(1, 4).map((item) => (
            <article className="event-card" key={item.day}>
              <div className="event-date">
                <b>{item.day}</b>
                <span>APR</span>
              </div>
              <div>
                <StatusBadge status={item.status} compact />
                <h3>{item.title}</h3>
                <p>{item.meta}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}

function TeamScreen() {
  const [team, setTeam] = useState("Women · Division 1")
  return (
    <main>
      <PageIntro
        eyebrow="Team schedule"
        title="Your side of the net"
        copy="Choose a team to see matches and training at a glance."
      />
      <div className="team-picker">
        <label htmlFor="team">Team</label>
        <div className="select-wrap">
          <select
            id="team"
            value={team}
            onChange={(e) => setTeam(e.target.value)}
          >
            <option>Women · Division 1</option>
            <option>Men · Division 2</option>
            <option>U18 · Juniors</option>
          </select>
          <Icon name="chevron" />
        </div>
      </div>
      <section className="section-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">April 2025</span>
            <h2>{team}</h2>
          </div>
          <span className="count-pill">5 events</span>
        </div>
        <div className="schedule-list">
          {[
            ["05", "SAT", "home", "vs. City Spikers", "19:30 · Field 1"],
            ["08", "TUE", "training", "Team training", "18:00–20:00 · Field 2"],
            ["12", "SAT", "away", "at Northside VC", "16:00 · Northside Arena"],
            [
              "15",
              "TUE",
              "no-training",
              "Training cancelled",
              "Coach unavailable",
            ],
            [
              "19",
              "SAT",
              "unavailable",
              "No field access",
              "Junior tournament",
            ],
          ].map(([day, wd, status, title, meta]) => (
            <article className="schedule-card" key={day}>
              <div className="event-date">
                <b>{day}</b>
                <span>{wd}</span>
              </div>
              <div className="schedule-copy">
                <StatusBadge status={status as Status} compact />
                <h3>{title}</h3>
                <p>{meta}</p>
              </div>
              <button className="arrow-button" aria-label={`View ${title}`}>
                <Icon name="arrow" />
              </button>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}

function SignInScreen({ onSignIn }: { onSignIn: () => void }) {
  const [showError, setShowError] = useState(false)
  return (
    <main className="auth-layout">
      <section className="auth-card">
        <div>
          <span className="eyebrow">Welcome back</span>
          <h2>Sign in to manage</h2>
          <p>Use your club account to continue.</p>
        </div>
        {showError && (
          <div className="error-banner" role="alert">
            <Icon name="alert" />
            <div>
              <b>We couldn’t sign you in</b>
              <span>Check your details and try again.</span>
            </div>
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (showError) onSignIn()
            else setShowError(true)
          }}
        >
          <label htmlFor="email">Email address</label>
          <input
            id="email"
            type="email"
            placeholder="you@club.org"
            defaultValue="alex@vcfalcons.org"
          />
          <div className="label-row">
            <label htmlFor="password">Password</label>
            <button type="button" className="text-button">
              Forgot password?
            </button>
          </div>
          <input
            id="password"
            type="password"
            placeholder="Enter password"
            defaultValue="volleyball"
          />
          <button className="solid-button full" type="submit">
            {showError ? "Try again" : "Sign in"} <Icon name="arrow" />
          </button>
        </form>
        <p className="auth-note">
          Need access? Ask your team manager to invite you.
        </p>
      </section>
    </main>
  )
}

function ManageScreen() {
  const [mode, setMode] = useState<Record<number, string>>({ 8: "move" })
  const [blocked, setBlocked] = useState(false)
  return (
    <main>
      <PageIntro
        eyebrow="Manager tools"
        title="Manage reservations"
        copy="Update field use for your teams. Changes are visible club-wide."
        action={<span className="manager-pill">Manager access</span>}
      />
      <section className="manager-block">
        <div className="manager-block-head">
          <div>
            <span className="eyebrow">April 2025</span>
            <h2>Field reservations</h2>
          </div>
          <button className="outline-button">Export calendar</button>
        </div>
        <div className="manage-list">
          {[
            {
              day: 5,
              wd: "SAT",
              title: "Falcons U18",
              meta: "19:30–21:30 · Field 1",
              kind: "Reserved",
            },
            {
              day: 8,
              wd: "TUE",
              title: "Women · Division 1",
              meta: "18:00–20:00 · Field 2",
              kind: "Reserved",
            },
            {
              day: 12,
              wd: "SAT",
              title: "Open field",
              meta: "17:00–21:00 · Field 1",
              kind: "Available",
            },
          ].map((row) => (
            <article className="manage-row" key={row.day}>
              <div className="event-date">
                <b>{row.day}</b>
                <span>{row.wd}</span>
              </div>
              <div className="manage-copy">
                <span
                  className={`availability ${
                    row.kind === "Available" ? "is-open" : ""
                  }`}
                >
                  {row.kind}
                </span>
                <h3>{row.title}</h3>
                <p>{row.meta}</p>
              </div>
              <div className="row-actions">
                {row.kind === "Available" ? (
                  <button
                    className="solid-button small"
                    onClick={() => setMode({ ...mode, [row.day]: "reserve" })}
                  >
                    Reserve
                  </button>
                ) : (
                  <>
                    <button
                      className="outline-button small"
                      onClick={() => setMode({ ...mode, [row.day]: "move" })}
                    >
                      Move
                    </button>
                    <button
                      className="danger-button small"
                      onClick={() => setMode({ ...mode, [row.day]: "cancel" })}
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
              {mode[row.day] && (
                <div
                  className={`inline-form ${
                    mode[row.day] === "cancel" ? "cancel-form" : ""
                  }`}
                >
                  {mode[row.day] === "cancel" ? (
                    <>
                      <div>
                        <b>Cancel this reservation?</b>
                        <span>
                          This field will become available to other teams.
                        </span>
                      </div>
                      <div>
                        <button
                          className="ghost-button"
                          onClick={() => setMode({ ...mode, [row.day]: "" })}
                        >
                          Keep it
                        </button>
                        <button className="danger-button">Yes, cancel</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="field">
                        <label>Team</label>
                        <select defaultValue={row.title}>
                          <option>{row.title}</option>
                          <option>Men · Division 2</option>
                          <option>Women · Division 1</option>
                        </select>
                      </div>
                      <div className="field">
                        <label>Time</label>
                        <select>
                          <option>18:00–20:00</option>
                          <option>19:30–21:30</option>
                        </select>
                      </div>
                      <button className="solid-button">
                        Confirm {mode[row.day]}
                      </button>
                      <button
                        className="icon-button"
                        aria-label="Close form"
                        onClick={() => setMode({ ...mode, [row.day]: "" })}
                      >
                        <Icon name="x" />
                      </button>
                    </>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
      <section className="block-panel">
        <div>
          <span className="eyebrow">Manager only</span>
          <h2>Block a slot</h2>
          <p>Mark a field unavailable for maintenance, events, or closures.</p>
        </div>
        {blocked ? (
          <div className="success-state">
            <span>
              <Icon name="check" />
            </span>
            <div>
              <b>Slot blocked</b>
              <p>April 22, 18:00–20:00 · Field 1</p>
            </div>
            <button className="text-button" onClick={() => setBlocked(false)}>
              Undo
            </button>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              setBlocked(true)
            }}
          >
            <div className="field">
              <label>Date</label>
              <input type="date" defaultValue="2025-04-22" />
            </div>
            <div className="field">
              <label>Field</label>
              <select>
                <option>Field 1</option>
                <option>Field 2</option>
              </select>
            </div>
            <div className="field">
              <label>Reason</label>
              <input placeholder="e.g. Maintenance" />
            </div>
            <button className="danger-button" type="submit">
              Block slot
            </button>
          </form>
        )}
      </section>
    </main>
  )
}

export default function App() {
  const [view, setView] = useState<View>("calendar")
  const [signedIn, setSignedIn] = useState(false)
  const [dark, setDark] = useState(false)
  return (
    <div className={dark ? "app dark" : "app"}>
      <Header
        view={view}
        setView={setView}
        signedIn={signedIn}
        setSignedIn={setSignedIn}
        dark={dark}
        setDark={setDark}
      />
      <div className="page-shell">
        {view === "calendar" && <CalendarScreen />}
        {view === "team" && <TeamScreen />}
        {view === "signin" && (
          <SignInScreen
            onSignIn={() => {
              setSignedIn(true)
              setView("manage")
            }}
          />
        )}
        {view === "manage" &&
          (signedIn ? (
            <ManageScreen />
          ) : (
            <SignInScreen
              onSignIn={() => {
                setSignedIn(true)
                setView("manage")
              }}
            />
          ))}
      </div>
      <MobileNav view={view} setView={setView} signedIn={signedIn} />
    </div>
  )
}
