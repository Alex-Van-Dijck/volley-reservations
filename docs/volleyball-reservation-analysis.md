# Volleyball Club Field Reservation: Analysis

## 1. Overview

A mobile-first PWA for a volleyball club with 4 teams and 2 fields. Team captains reserve a field for their team's home games. Fields without a home game are used for practice. Everyone can see a calendar of who has which field, and each team has its own view of what it is doing in a given slot. The manager can mark a slot as unavailable.

The project is delivered to the club and is also a learning project: the backend is built in Node first and later ported to Java.

## 2. Scope

### In scope (v1)

- Reserve, cancel and move a home game on a specific field
- Enter, cancel and move away games (informational only)
- Public, read-only, unauthenticated calendar showing who has which field
- Per-team view showing training, home game, away game or no training
- Manager can mark a slot as unavailable
- Login for captains and the manager (accounts created beforehand)
- Initial slot: Thursday 20:00-22:00, 2 fields
- Calendar window: from today until the end of the season (assumed to be August)

### Out of scope (for now)

- Registration, password reset and user management
- Notifications
- Weekend slots (planned expansion, see section 10)

## 3. Roles and permissions

| Action | Visitor | Captain | Manager |
|---|---|---|---|
| View club calendar | yes | yes | yes |
| View team view | yes | yes | yes |
| Add / cancel / move home game | no | own team only | any team |
| Add / cancel / move away game | no | own team only | any team |
| Mark a slot as unavailable | no | no | yes |

Accounts are created manually before launch. A captain account is linked to exactly one team. The manager account is not linked to a team.

## 4. Domain model

| Entity | Fields | Notes |
|---|---|---|
| Team | id, name | 4 teams |
| Field | id, name, size (small / big) | 2 fields at launch. Size is purely informational |
| Slot | id, weekday, start, end | Fixed 2-hour blocks, defined as data. Thursday 20:00-22:00 is one slot covering both fields |
| Event | id, team, date, slot, type (home / away), field (home only) | One table for both home and away games |
| Block | id, date, slot, reason (optional) | The manager marks a (date, slot) as unavailable |
| User | id, role (captain / manager), team (captain only), credentials | Created manually |
| Season setting | end date | End of the season (assumed August). Stored as configuration, not hard-coded |

Slots are stored as data rather than free timestamps. Because blocks are always 2 hours, overlap detection reduces to comparing (date, slot) pairs, and adding weekend slots later is a data change.

## 5. Business rules

1. **No overlap:** a field can host at most one home game per (date, slot).
2. **Capacity:** with 2 fields, a third home game in the same (date, slot) is refused. This follows from rule 1 and the fact that the captain picks a specific field.
3. **One event per team per slot:** a team has at most one event (home or away) in the same (date, slot).
4. **Away games block nothing:** they exist so the team view is complete.
5. **Home requires a field; away has none.**
6. **Date and slot must match:** the weekday of the date must equal the slot's weekday.
7. **No past events:** an event cannot be created in the past. A move creates the event at a new position, so it cannot move an event into the past either.
8. **Season window:** events can only be created for dates up to the season end date.
9. **Blocked slots:** no home game can be created in a (date, slot) that the manager has blocked.
10. **Permissions:** a captain can only create, cancel or move events for their own team. The manager can do so for any team, and is the only one who can create or remove a block.
11. **Move = cancel + create, atomically:** a failed move leaves the original event untouched. Rules 1-3 and 7-9 are checked against the new position, ignoring the event being moved.
12. **No deadlines:** cancelling and moving are allowed at any time, apart from the restriction on past dates in rule 7.

## 6. Derived state: practice and the team view

Practice is never booked. It is derived per (date, slot):

- If the slot is **blocked**, there is no practice.
- Otherwise, **practice fields** = fields in the slot without a home game.
- If there are **0 practice fields** (both fields have home games), there is **no training**.

A team's status for a (date, slot) is the first match of:

1. The team has a home game: **Home game** (with field)
2. The team has an away game: **Away game**
3. The slot is blocked: **Unavailable**
4. At least one practice field exists: **Training** (on the free field(s))
5. Otherwise: **No training**

The club calendar shows, per slot, each home game with its team and field, the field(s) left free for practice, or that the slot is unavailable.

## 7. Views and screens

| Screen | Audience | Content |
|---|---|---|
| Club calendar | everyone | Per date and slot: home games per field, free field(s) marked as practice, unavailable slots |
| Team view | everyone | Per date: Home game / Away game / Unavailable / Training / No training for the selected team |
| Add / edit event | captain, manager | Pick date, slot, type; for home games pick a field (small or big); for the manager also pick a team |
| Manage blocks | manager | Mark or unmark a (date, slot) as unavailable, optional reason |
| Login | captain, manager | Simple credential login |

The calendar is generated from slot definitions for the dates from today until the season end, so slots with no events still show as open or as practice.

## 8. Open questions

1. **Blocking and existing events:** What should happen when the manager blocks a slot that already has home games? Options: refuse the block until those events are cancelled, or allow the block and flag the affected events. Also, does a block affect away games, or only the hall (home games and practice)? Section 6 currently lets an away game take precedence in the team view, which assumes away games are unaffected.
2. **Blocking granularity:** Does a block cover the whole slot (both fields), or can the manager block a single field? This document assumes the whole slot.
3. **Definition of "past":** Is an event in the past once its date is before today, or once the slot has started or ended? For example, can a captain still enter a game on Thursday at 21:00 for that same evening?
4. **Cancelling past events:** Rule 7 only restricts creating events. Can past events still be cancelled or edited (for instance by the manager, to correct a mistake)?
5. **Season end:** Is the end date 31 August of the current year? And what happens at the season change: who updates the end date, and does the calendar simply remain empty until that is done?

## 9. Technical considerations

- **Enforce overlap in the database**, not only in application code: a unique constraint on (field, date, slot) for home games, and a unique constraint on (team, date, slot). This protects against two simultaneous bookings and stays valid across the Node to Java port.
- **One events table** with a nullable field: a check constraint ties "home <=> field present". Unique indexes ignore null values in the usual databases, so away games don't collide on the field constraint.
- **Blocks as their own table** with a unique constraint on (date, slot). The "no home game in a blocked slot" rule needs a check inside the same transaction as the insert, since it spans two tables.
- **Past-date and season-window checks** live in the domain layer and use the current local date. Inject the clock so the rules can be tested.
- **Dates as plain local dates plus slot**, with no timestamps, to avoid time zone and DST issues.
- **Contract-first API (OpenAPI):** the spec is the source of truth. The PWA and the database schema stay unchanged when the backend is ported, and the same API tests can validate both the Node and Java implementations.
- **Framework-free domain layer** for the rules in section 5, so the port to Java is mostly a translation.
- **Scale is tiny** (4 teams, a handful of users), so correctness and simplicity matter more than performance.

## 10. Future expansion

Not relevant for now, but the model should not block it:

- **Saturday morning:** 1 field, same hall, time to be confirmed (about 10:30-12, but unsure)
- **Sunday morning:** 1 field, same hall, time unknown

Impact on the model: new slot rows with weekday and time. Because weekend slots have only 1 field, the model will then need to express which fields exist in which slot, for example with a Slot-Field availability link. At launch both fields are available in the only slot, so this link can be added when the expansion starts.

## 11. Suggested milestones

1. Data model and the database constraints (rules 1-3)
2. Read-only API and public club calendar
3. Team view, including derived training state
4. Authentication (captain and manager) and permission checks
5. Create, cancel and move events, including atomic move, past-date and season-window checks
6. Slot blocking (manager)
7. PWA polish: installability, mobile layout
8. Port the backend to Java against the same API contract
9. Expansion: weekend slots and slot-field availability
