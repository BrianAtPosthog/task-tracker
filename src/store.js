// All task logic lives here. The UI API and the MCP server both call these functions.
import { DatabaseSync, backup as sqliteBackup } from "node:sqlite"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

export const dataDir = process.env.TASKS_DATA_DIR || path.join(os.homedir(), ".task-tracker")
fs.mkdirSync(dataDir, { recursive: true })

const db = new DatabaseSync(process.env.TASKS_DB || path.join(dataDir, "tasks.db"))
// Personal settings live outside the repo in <dataDir>/config.json: { "owner": "Your name", "company": "Acme", "team": "Growth" }.
export function getConfig() {
  try { return JSON.parse(fs.readFileSync(path.join(dataDir, "config.json"), "utf8")) } catch { return {} }
}
export const owner = getConfig().owner || "the owner"
// Replace {{owner}} / {{company}} / {{team}} in text shown to assistants.
export function personalize(text) {
  const c = getConfig()
  return text.replace(/\{\{owner\}\}/g, owner).replace(/\{\{company\}\}/g, c.company || "the company").replace(/\{\{team\}\}/g, c.team || "the team")
}
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;")
db.exec(`
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'todo',
  priority INTEGER NOT NULL DEFAULT 3,
  impact INTEGER NOT NULL DEFAULT 3,
  due_date TEXT,
  project TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  recurrence TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  added_by TEXT NOT NULL DEFAULT 'me'
);
CREATE TABLE IF NOT EXISTS people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  contact TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS task_people (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'waiting_on',
  note TEXT NOT NULL DEFAULT '',
  resolved INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (task_id, person_id, role)
);
CREATE TABLE IF NOT EXISTS task_deps (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, depends_on_id)
);
CREATE TABLE IF NOT EXISTS links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  added_by TEXT NOT NULL DEFAULT 'me',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  added_by TEXT NOT NULL DEFAULT 'me',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS inbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  suggested TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  added_by TEXT NOT NULL DEFAULT 'me',
  created_at TEXT NOT NULL,
  resolved_at TEXT
);
`)
// Columns added after the first release. Safe to re-run; SQLite refuses duplicates and we ignore that.
for (const sql of [
  "ALTER TABLE tasks ADD COLUMN effort TEXT NOT NULL DEFAULT 'medium'",
  "ALTER TABLE tasks ADD COLUMN next_action TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE tasks ADD COLUMN context TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE tasks ADD COLUMN channels TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE tasks ADD COLUMN skills TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE task_people ADD COLUMN ask_count INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE task_people ADD COLUMN last_asked_at TEXT",
  "ALTER TABLE tasks ADD COLUMN handoff TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE tasks ADD COLUMN handoff_updated_at TEXT",
  "ALTER TABLE tasks ADD COLUMN handoff_updated_by TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE tasks ADD COLUMN progress INTEGER", // 0–100, manual; null = estimate from activity
]) { try { db.exec(sql) } catch (e) { if (!/duplicate column/.test(e.message)) throw e } }
db.exec(`CREATE TABLE IF NOT EXISTS project_handoffs (
  project TEXT PRIMARY KEY COLLATE NOCASE,
  handoff TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT ''
)`)

// The shape every handoff doc should follow. Assistants get this from the MCP instructions; the UI offers it as a starter.
export const HANDOFF_TEMPLATE = `## Current state
<one paragraph: where this stands right now>

## Decisions so far
- <decision> — <why> (<date>)

## Sources
- <label>: <url> — <what's in it>

## Next steps
1. <next concrete action>

## Open questions
- <what's unresolved and who can answer it>

## Gotchas
- <things that bit us / things not to redo>`

export const STATUSES = ["todo", "in_progress", "blocked", "done"]
export const ROLES = ["waiting_on", "collaborator", "owed_to"] // owed_to = the owner owes this person something
export const EFFORTS = ["quick", "medium", "deep"] // quick = under ~20 min, deep = multi-session "chip away" work
export const NEXT_ACTIONS = ["", "slack_reply", "email_reply", "creative_review", "write", "build", "decide", "meeting", "research", "wait"]
export const INBOX_KINDS = ["new_task", "update", "missing", "asset", "follow_up"]
export const INBOX_STATUSES = ["new", "accepted", "dismissed"]
let lastNow = 0
const now = () => { let t = Date.now(); if (t <= lastNow) t = lastNow + 1; lastNow = t; return new Date(t).toISOString() }

// ---- dates (plain YYYY-MM-DD strings, local time) ----
const pad = (n) => String(n).padStart(2, "0")
export const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const parse = (s) => {
  const [y, m, d] = s.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
const fmt = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
const checkDate = (s) => {
  if (s == null || s === "") return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(parse(s))) throw new Error(`Bad date "${s}", use YYYY-MM-DD`)
  return s
}

// ---- recurrence: {freq: daily|weekly|monthly|yearly, interval?: n, weekdays?: [0-6, Sun=0]} ----
export function normalizeRecurrence(r) {
  if (r == null || r === "" || r === "none") return null
  if (typeof r === "string") {
    try { r = JSON.parse(r) } catch { r = { freq: r } }
  }
  if (!["daily", "weekly", "monthly", "yearly"].includes(r.freq)) throw new Error("recurrence.freq must be daily, weekly, monthly, or yearly")
  const out = { freq: r.freq, interval: Math.max(1, Number(r.interval) || 1) }
  if (r.freq === "weekly" && Array.isArray(r.weekdays) && r.weekdays.length) {
    out.weekdays = [...new Set(r.weekdays.map(Number))].filter((n) => n >= 0 && n <= 6).sort()
  }
  return out
}

export function nextDate(from, rec) {
  const d = parse(from)
  if (rec.freq === "daily") d.setUTCDate(d.getUTCDate() + rec.interval)
  else if (rec.freq === "weekly" && rec.weekdays?.length) {
    // next listed weekday after `from`; skip whole weeks when interval > 1
    for (let i = 1; i <= 7; i++) {
      const c = new Date(d)
      c.setUTCDate(c.getUTCDate() + i)
      if (rec.weekdays.includes(c.getUTCDay())) {
        const wrapped = c.getUTCDay() <= d.getUTCDay()
        if (wrapped && rec.interval > 1) c.setUTCDate(c.getUTCDate() + 7 * (rec.interval - 1))
        return fmt(c)
      }
    }
  } else if (rec.freq === "weekly") d.setUTCDate(d.getUTCDate() + 7 * rec.interval)
  else if (rec.freq === "monthly") {
    const day = d.getUTCDate()
    d.setUTCDate(1)
    d.setUTCMonth(d.getUTCMonth() + rec.interval)
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
    d.setUTCDate(Math.min(day, last))
  } else if (rec.freq === "yearly") {
    const day = d.getUTCDate(), month = d.getUTCMonth()
    d.setUTCFullYear(d.getUTCFullYear() + rec.interval, month, 1)
    const last = new Date(Date.UTC(d.getUTCFullYear(), month + 1, 0)).getUTCDate()
    d.setUTCDate(Math.min(day, last))
  }
  return fmt(d)
}

// ---- links: auto-detect what a URL is ----
export function detectKind(url) {
  let u
  try { u = new URL(url) } catch { throw new Error(`Not a valid URL: ${url}`) }
  const h = u.hostname.replace(/^www\./, ""), p = u.pathname
  if (h === "claude.ai" || h.endsWith(".claude.ai")) return p.includes("/artifact") ? "claude_artifact" : "claude_chat"
  if (h === "chatgpt.com" || h === "chat.openai.com") return "chatgpt_chat"
  if (h.endsWith("slack.com")) return "slack"
  if (h === "github.com") {
    if (/\/pull\/\d+/.test(p)) return "github_pr"
    if (/\/issues\/\d+/.test(p)) return "github_issue"
    return "github"
  }
  if (h === "docs.google.com") {
    if (p.startsWith("/spreadsheets")) return "google_sheet"
    if (p.startsWith("/presentation")) return "google_slides"
    return "google_doc"
  }
  if (h === "drive.google.com") return "google_drive"
  if (h === "mail.google.com") return "email"
  if (h === "notion.so" || h.endsWith(".notion.site")) return "notion"
  if (h === "linear.app") return "linear"
  if (h === "figma.com") return "figma"
  if (h.endsWith("granola.ai")) return "granola"
  if (h === "posthog.com" || h.endsWith(".posthog.com")) {
    if (/\/rfcs?\//i.test(p)) return "rfc"
    return "posthog"
  }
  if (/\brfcs?\b/i.test(p)) return "rfc"
  return "link"
}
export const LINK_KINDS = ["claude_chat", "claude_artifact", "chatgpt_chat", "slack", "github_pr", "github_issue", "github", "google_doc", "google_sheet", "google_slides", "google_drive", "email", "rfc", "granola", "figma", "notion", "linear", "posthog", "link"]
const listField = (v) => [].concat(v ?? []).map((x) => String(x).trim()).filter(Boolean)
const splitField = (s) => (s ? s.split(",").filter(Boolean) : [])

// ---- helpers ----
const rows = (sql, ...a) => db.prepare(sql).all(...a)
const row = (sql, ...a) => db.prepare(sql).get(...a)
const run = (sql, ...a) => db.prepare(sql).run(...a)
const tx = (fn) => {
  db.exec("BEGIN")
  try { const r = fn(); db.exec("COMMIT"); return r } catch (e) { db.exec("ROLLBACK"); throw e }
}
const clamp = (n, lo, hi, label) => {
  n = Number(n)
  if (!Number.isInteger(n) || n < lo || n > hi) throw new Error(`${label} must be a whole number from ${lo} to ${hi}`)
  return n
}

// Higher = do sooner. Overdue and due-soon beat everything; then priority and impact.
function score(t) {
  let s = (5 - t.priority) * 10 + t.impact * 4
  if (t.due_date) {
    const days = Math.round((parse(t.due_date) - parse(today())) / 86400000)
    if (days < 0) s += 40 + Math.min(-days, 10)
    else if (days === 0) s += 30
    else if (days <= 3) s += 15
    else if (days <= 7) s += 6
  }
  if (t.status === "in_progress") s += 3
  return s
}

// Rough quest progress when the owner hasn't set one: activity (notes, links) and status.
function estimateProgress(t) {
  const n = row("SELECT COUNT(*) c FROM notes WHERE task_id = ?", t.id).c
  const l = row("SELECT COUNT(*) c FROM links WHERE task_id = ?", t.id).c
  let p = Math.min(80, n * 12 + l * 5)
  if (t.status === "in_progress") p = Math.max(p, 15)
  if (t.handoff) p = Math.max(p, 25)
  return p
}
function decorate(t) {
  const people = rows(
    `SELECT p.id AS person_id, p.name, p.contact, tp.role, tp.note, tp.resolved, tp.ask_count, tp.last_asked_at
     FROM task_people tp JOIN people p ON p.id = tp.person_id WHERE tp.task_id = ?`, t.id)
  const deps = rows(
    `SELECT d.id, d.title, d.status FROM task_deps td JOIN tasks d ON d.id = td.depends_on_id WHERE td.task_id = ?`, t.id)
  const waiting = people.filter((p) => p.role === "waiting_on" && !p.resolved).map((p) => p.name)
  const owed = people.filter((p) => p.role === "owed_to" && !p.resolved).map((p) => p.name)
  const openDeps = deps.filter((d) => d.status !== "done")
  return {
    ...t,
    recurrence: t.recurrence ? JSON.parse(t.recurrence) : null,
    channels: splitField(t.channels),
    skills: splitField(t.skills),
    people,
    asked_twice: people.filter((p) => p.ask_count >= 2).map((p) => p.name),
    owed_to: owed,
    // "You owe" = someone is waiting on the owner: an explicit owed_to person, a pending reply-type next action, or repeated pings.
    is_owed: owed.length > 0 || ["slack_reply", "email_reply", "creative_review", "decide"].includes(t.next_action) || people.some((p) => p.ask_count > 0 && !p.resolved),
    // Stale = the task has moved (notes, links, status) since the handoff was last written, or there is no handoff at all.
    handoff_stale: t.status !== "done" && (!t.handoff || (t.handoff_updated_at ?? "") < t.updated_at),
    progress: t.status === "done" ? 100 : t.progress ?? estimateProgress(t),
    depends_on: deps,
    blocked_by: { people: waiting, tasks: openDeps.map((d) => ({ id: d.id, title: d.title })) },
    is_blocked: waiting.length > 0 || openDeps.length > 0,
    overdue: !!t.due_date && t.status !== "done" && t.due_date < today(),
    score: score(t),
  }
}

// ---- tasks ----
export function getTask(id) {
  const t = row("SELECT * FROM tasks WHERE id = ?", id)
  if (!t) throw new Error(`No task with id ${id}`)
  return {
    ...decorate(t),
    links: rows("SELECT * FROM links WHERE task_id = ? ORDER BY id", id),
    notes: rows("SELECT * FROM notes WHERE task_id = ? ORDER BY id", id),
  }
}

export function createTask(i = {}) {
  if (!i.title?.trim()) throw new Error("title is required")
  const status = i.status ?? "todo"
  if (!STATUSES.includes(status)) throw new Error(`status must be one of ${STATUSES.join(", ")}`)
  const effort = i.effort ?? "medium", next_action = i.next_action ?? ""
  if (!EFFORTS.includes(effort)) throw new Error(`effort must be one of ${EFFORTS.join(", ")}`)
  if (!NEXT_ACTIONS.includes(next_action)) throw new Error(`next_action must be one of ${NEXT_ACTIONS.filter(Boolean).join(", ")}`)
  const id = tx(() => {
    const r = run(
      `INSERT INTO tasks (title, description, status, priority, impact, due_date, project, tags, recurrence, effort, next_action, context, channels, skills, progress, created_at, updated_at, added_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      i.title.trim(), i.description ?? "", status,
      clamp(i.priority ?? 3, 1, 4, "priority"), clamp(i.impact ?? 3, 1, 5, "impact"),
      checkDate(i.due_date), i.project ?? "", listField(i.tags).join(","),
      i.recurrence ? JSON.stringify(normalizeRecurrence(i.recurrence)) : null,
      effort, next_action, i.context ?? "", listField(i.channels).join(","), listField(i.skills).join(","),
      i.progress == null ? null : clamp(i.progress, 0, 100, "progress"),
      now(), now(), i.added_by ?? "me")
    const tid = Number(r.lastInsertRowid)
    for (const l of i.links ?? []) addLink({ task_id: tid, ...(typeof l === "string" ? { url: l } : l), added_by: i.added_by })
    for (const p of i.waiting_on ?? []) setPerson({ task_id: tid, name: p, role: "waiting_on" })
    for (const p of i.collaborators ?? []) setPerson({ task_id: tid, name: p, role: "collaborator" })
    for (const p of i.owed_to ?? []) setPerson({ task_id: tid, name: p, role: "owed_to" })
    return tid
  })
  return getTask(id)
}

export function updateTask(id, i = {}) {
  const cur = row("SELECT * FROM tasks WHERE id = ?", id)
  if (!cur) throw new Error(`No task with id ${id}`)
  const set = {}
  if (i.title !== undefined) { if (!i.title.trim()) throw new Error("title can't be empty"); set.title = i.title.trim() }
  if (i.description !== undefined) set.description = i.description
  if (i.status !== undefined) {
    if (!STATUSES.includes(i.status)) throw new Error(`status must be one of ${STATUSES.join(", ")}`)
    set.status = i.status
    set.completed_at = i.status === "done" ? now() : null
  }
  if (i.priority !== undefined) set.priority = clamp(i.priority, 1, 4, "priority")
  if (i.impact !== undefined) set.impact = clamp(i.impact, 1, 5, "impact")
  if (i.due_date !== undefined) set.due_date = checkDate(i.due_date)
  if (i.project !== undefined) set.project = i.project
  if (i.tags !== undefined) set.tags = listField(i.tags).join(",")
  if (i.recurrence !== undefined) set.recurrence = i.recurrence ? JSON.stringify(normalizeRecurrence(i.recurrence)) : null
  if (i.effort !== undefined) { if (!EFFORTS.includes(i.effort)) throw new Error(`effort must be one of ${EFFORTS.join(", ")}`); set.effort = i.effort }
  if (i.next_action !== undefined) { const v = i.next_action ?? ""; if (!NEXT_ACTIONS.includes(v)) throw new Error(`next_action must be one of ${NEXT_ACTIONS.filter(Boolean).join(", ")}`); set.next_action = v }
  if (i.context !== undefined) set.context = i.context ?? ""
  if (i.append_context) set.context = `${cur.context}${cur.context ? "\n\n" : ""}${i.append_context}`
  if (i.channels !== undefined) set.channels = listField(i.channels).join(",")
  if (i.skills !== undefined) set.skills = listField(i.skills).join(",")
  if (i.handoff !== undefined) { set.handoff = i.handoff ?? ""; set.handoff_updated_at = now(); set.handoff_updated_by = i.updated_by ?? "me" }
  if (i.progress !== undefined) set.progress = i.progress == null ? null : clamp(i.progress, 0, 100, "progress")
  set.updated_at = now()
  // Writing the handoff alone shouldn't make it look stale against itself.
  if (i.handoff !== undefined) set.handoff_updated_at = set.updated_at
  const keys = Object.keys(set)
  run(`UPDATE tasks SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`, ...keys.map((k) => set[k]), id)
  // Finishing a recurring task through update behaves the same as complete_task.
  if (i.status === "done" && cur.status !== "done" && cur.recurrence) spawnNext(cur)
  return getTask(id)
}

function spawnNext(t) {
  const rec = JSON.parse(t.recurrence)
  const base = t.due_date && t.due_date > today() ? t.due_date : (t.due_date ?? today())
  let next = nextDate(base, rec)
  while (next <= today()) next = nextDate(next, rec) // don't create a task already overdue
  const copy = tx(() => {
    const r = run(
      `INSERT INTO tasks (title, description, status, priority, impact, due_date, project, tags, recurrence, effort, next_action, context, channels, skills, created_at, updated_at, added_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      t.title, t.description, "todo", t.priority, t.impact, next, t.project, t.tags, t.recurrence, t.effort, t.next_action, t.context, t.channels, t.skills, now(), now(), t.added_by)
    const nid = Number(r.lastInsertRowid)
    for (const p of rows("SELECT * FROM task_people WHERE task_id = ? AND role = 'collaborator'", t.id))
      run("INSERT INTO task_people (task_id, person_id, role) VALUES (?,?,?)", nid, p.person_id, p.role)
    return nid
  })
  return copy
}

export function completeTask(id, { closing_notes, added_by = "me" } = {}) {
  const cur = row("SELECT * FROM tasks WHERE id = ?", id)
  if (!cur) throw new Error(`No task with id ${id}`)
  if (cur.status === "done") return { task: getTask(id), next: null }
  if (closing_notes?.trim()) {
    // Why/how it closed: a note for the record, and an Outcome section on the handoff so the next reader sees it first.
    addNote({ task_id: id, title: "Closing notes", body: closing_notes.trim(), added_by })
    const stamp = now()
    run("UPDATE tasks SET handoff = ?, handoff_updated_at = ?, handoff_updated_by = ? WHERE id = ?",
      `## Outcome (${today()})\n${closing_notes.trim()}\n\n${cur.handoff}`.trim(), stamp, added_by, id)
  }
  run("UPDATE tasks SET status='done', completed_at=?, updated_at=? WHERE id=?", now(), now(), id)
  const nextId = cur.recurrence ? spawnNext(cur) : null
  return { task: getTask(id), next: nextId ? getTask(nextId) : null }
}

export function deleteTask(id) {
  const r = run("DELETE FROM tasks WHERE id = ?", id)
  if (!r.changes) throw new Error(`No task with id ${id}`)
  return { deleted: id }
}

export function listTasks(f = {}) {
  const where = [], args = []
  if (f.status) { where.push(`status IN (${[].concat(f.status).map(() => "?").join(",")})`); args.push(...[].concat(f.status)) }
  else if (!f.include_done) where.push("status != 'done'")
  if (f.project) { where.push("project = ? COLLATE NOCASE"); args.push(f.project) }
  if (f.tag) { where.push("(',' || tags || ',') LIKE ?"); args.push(`%,${f.tag},%`) }
  if (f.max_priority) { where.push("priority <= ?"); args.push(Number(f.max_priority)) }
  if (f.min_impact) { where.push("impact >= ?"); args.push(Number(f.min_impact)) }
  if (f.effort) { where.push("effort = ?"); args.push(f.effort) }
  if (f.next_action) { where.push("next_action = ?"); args.push(f.next_action) }
  if (f.skill) { where.push("(',' || skills || ',') LIKE ?"); args.push(`%,${f.skill},%`) }
  if (f.channel) { where.push("(',' || channels || ',') LIKE ?"); args.push(`%,${f.channel},%`) }
  if (f.due_before) { where.push("due_date IS NOT NULL AND due_date <= ?"); args.push(f.due_before) }
  if (f.due_after) { where.push("due_date IS NOT NULL AND due_date >= ?"); args.push(f.due_after) }
  if (f.query) { where.push("(title LIKE ? OR description LIKE ?)"); args.push(`%${f.query}%`, `%${f.query}%`) }
  let list = rows(`SELECT * FROM tasks ${where.length ? "WHERE " + where.join(" AND ") : ""}`, ...args).map(decorate)
  if (f.person) {
    const p = f.person.toLowerCase()
    list = list.filter((t) => t.people.some((x) => x.name.toLowerCase() === p && !x.resolved))
  }
  if (f.owed === true) list = list.filter((t) => t.is_owed)
  if (f.blocked === true) list = list.filter((t) => t.is_blocked)
  if (f.blocked === false) list = list.filter((t) => !t.is_blocked)
  list.sort((a, b) => b.score - a.score || a.id - b.id)
  const counts = rows("SELECT task_id, kind, COUNT(*) c FROM links GROUP BY task_id, kind")
  const byTask = {}
  for (const c of counts) (byTask[c.task_id] ??= {})[c.kind] = c.c
  return list.map((t) => ({ ...t, link_counts: byTask[t.id] ?? {} }))
}

// ---- links ----
export function addLink({ task_id, url, title = "", kind, added_by = "me" }) {
  if (!row("SELECT 1 FROM tasks WHERE id = ?", task_id)) throw new Error(`No task with id ${task_id}`)
  const k = kind || detectKind(url)
  const dup = row("SELECT id FROM links WHERE task_id = ? AND url = ?", task_id, url)
  if (dup) { if (title) run("UPDATE links SET title = ? WHERE id = ?", title, dup.id); return row("SELECT * FROM links WHERE id = ?", dup.id) }
  const r = run("INSERT INTO links (task_id, url, kind, title, added_by, created_at) VALUES (?,?,?,?,?,?)", task_id, url, k, title, added_by, now())
  run("UPDATE tasks SET updated_at = ? WHERE id = ?", now(), task_id)
  return row("SELECT * FROM links WHERE id = ?", Number(r.lastInsertRowid))
}
export function removeLink(id) {
  if (!run("DELETE FROM links WHERE id = ?", id).changes) throw new Error(`No link with id ${id}`)
  return { deleted: id }
}

// ---- notes (attached to a task, or standalone when task_id is null) ----
export function addNote({ task_id = null, title = "", body = "", added_by = "me" }) {
  if (task_id != null && !row("SELECT 1 FROM tasks WHERE id = ?", task_id)) throw new Error(`No task with id ${task_id}`)
  if (!title.trim() && !body.trim()) throw new Error("A note needs a title or a body")
  const r = run("INSERT INTO notes (task_id, title, body, added_by, created_at, updated_at) VALUES (?,?,?,?,?,?)", task_id, title, body, added_by, now(), now())
  if (task_id != null) run("UPDATE tasks SET updated_at = ? WHERE id = ?", now(), task_id)
  return row("SELECT * FROM notes WHERE id = ?", Number(r.lastInsertRowid))
}
export function updateNote(id, { title, body, append }) {
  const n = row("SELECT * FROM notes WHERE id = ?", id)
  if (!n) throw new Error(`No note with id ${id}`)
  const newBody = append ? `${n.body}${n.body ? "\n\n" : ""}${append}` : body ?? n.body
  run("UPDATE notes SET title = ?, body = ?, updated_at = ? WHERE id = ?", title ?? n.title, newBody, now(), id)
  return row("SELECT * FROM notes WHERE id = ?", id)
}
export function deleteNote(id) {
  if (!run("DELETE FROM notes WHERE id = ?", id).changes) throw new Error(`No note with id ${id}`)
  return { deleted: id }
}
export function listNotes({ task_id, query, standalone } = {}) {
  const where = [], args = []
  if (task_id != null) { where.push("task_id = ?"); args.push(task_id) }
  if (standalone) where.push("task_id IS NULL")
  if (query) { where.push("(title LIKE ? OR body LIKE ?)"); args.push(`%${query}%`, `%${query}%`) }
  return rows(`SELECT * FROM notes ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY updated_at DESC`, ...args)
}

// ---- people & dependencies ----
export function setPerson({ task_id, name, role = "waiting_on", note, resolved, contact, asked }) {
  if (!ROLES.includes(role)) throw new Error(`role must be one of ${ROLES.join(", ")}`)
  if (!row("SELECT 1 FROM tasks WHERE id = ?", task_id)) throw new Error(`No task with id ${task_id}`)
  if (!name?.trim()) throw new Error("name is required")
  run("INSERT OR IGNORE INTO people (name, contact) VALUES (?, ?)", name.trim(), contact ?? "")
  if (contact) run("UPDATE people SET contact = ? WHERE name = ?", contact, name.trim())
  const p = row("SELECT id FROM people WHERE name = ?", name.trim())
  const existing = row("SELECT * FROM task_people WHERE task_id = ? AND person_id = ? AND role = ?", task_id, p.id, role)
  const askCount = (existing?.ask_count ?? 0) + (asked ? 1 : 0)
  run(
    `INSERT INTO task_people (task_id, person_id, role, note, resolved, ask_count, last_asked_at) VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(task_id, person_id, role) DO UPDATE SET note = excluded.note, resolved = excluded.resolved, ask_count = excluded.ask_count, last_asked_at = excluded.last_asked_at`,
    task_id, p.id, role, note ?? existing?.note ?? "", (resolved ?? !!existing?.resolved) ? 1 : 0, askCount, asked ? now() : existing?.last_asked_at ?? null)
  run("UPDATE tasks SET updated_at = ? WHERE id = ?", now(), task_id)
  return getTask(task_id)
}
export function removePerson({ task_id, name, role }) {
  const p = row("SELECT id FROM people WHERE name = ?", name)
  if (!p) throw new Error(`No person named ${name}`)
  run(`DELETE FROM task_people WHERE task_id = ? AND person_id = ? ${role ? "AND role = ?" : ""}`, ...[task_id, p.id, ...(role ? [role] : [])])
  return getTask(task_id)
}
export function listPeople() {
  return rows(
    `SELECT p.id, p.name, p.contact,
       SUM(CASE WHEN tp.role='waiting_on' AND tp.resolved=0 AND t.status!='done' THEN 1 ELSE 0 END) AS waiting_on_count,
       SUM(CASE WHEN tp.role='collaborator' AND t.status!='done' THEN 1 ELSE 0 END) AS collaborating_count,
       SUM(CASE WHEN tp.role='owed_to' AND tp.resolved=0 AND t.status!='done' THEN 1 ELSE 0 END) AS owed_count
     FROM people p LEFT JOIN task_people tp ON tp.person_id = p.id LEFT JOIN tasks t ON t.id = tp.task_id
     GROUP BY p.id ORDER BY owed_count DESC, waiting_on_count DESC, p.name`)
}
export function addDependency(task_id, depends_on_id) {
  if (task_id === depends_on_id) throw new Error("A task can't depend on itself")
  getTask(task_id); getTask(depends_on_id)
  // refuse loops: does depends_on already (transitively) depend on task?
  const seen = new Set(), stack = [depends_on_id]
  while (stack.length) {
    const c = stack.pop()
    if (c === task_id) throw new Error("That would create a dependency loop")
    if (seen.has(c)) continue
    seen.add(c)
    for (const d of rows("SELECT depends_on_id FROM task_deps WHERE task_id = ?", c)) stack.push(d.depends_on_id)
  }
  run("INSERT OR IGNORE INTO task_deps (task_id, depends_on_id) VALUES (?,?)", task_id, depends_on_id)
  return getTask(task_id)
}
export function removeDependency(task_id, depends_on_id) {
  run("DELETE FROM task_deps WHERE task_id = ? AND depends_on_id = ?", task_id, depends_on_id)
  return getTask(task_id)
}

// ---- views ----
export function briefing() {
  const open = listTasks({})
  const t = today()
  const ready = open.filter((x) => !x.is_blocked)
  const byAction = {}
  for (const x of ready) if (x.next_action) (byAction[x.next_action] ??= []).push(slim(x))
  return {
    today: t,
    overdue: open.filter((x) => x.overdue).map(slim),
    due_today: open.filter((x) => x.due_date === t).map(slim),
    top_focus: ready.slice(0, 5).map(slim),
    quick_wins: ready.filter((x) => x.effort === "quick").slice(0, 8).map(slim),
    chip_away: chipAway().slice(0, 5).map(slim),
    by_next_action: byAction,
    waiting_on_people: open.filter((x) => x.blocked_by.people.length).map((x) => ({ ...slim(x), waiting_on: x.blocked_by.people })),
    asked_twice: open.filter((x) => x.asked_twice.length).map((x) => ({ ...slim(x), people: x.asked_twice })),
    you_owe: owed().slice(0, 8).map((x) => ({ ...slim(x), owed_to: x.owed_to, asked_by: x.people.filter((p) => p.ask_count > 0 && !p.resolved).map((p) => p.name) })),
    inbox_new: row("SELECT COUNT(*) c FROM inbox WHERE status = 'new'").c,
    stale_handoffs: open.filter((x) => x.status === "in_progress" && x.handoff_stale).map(slim),
    counts: { open: open.length, blocked: open.filter((x) => x.is_blocked).length, quick: ready.filter((x) => x.effort === "quick").length },
  }
}
const slim = (x) => ({ id: x.id, title: x.title, priority: x.priority, impact: x.impact, due_date: x.due_date, status: x.status, project: x.project, effort: x.effort, next_action: x.next_action })

// Tasks where someone is waiting on the owner, most-pinged and most urgent first.
export function owed() {
  return listTasks({ owed: true }).sort((a, b) => {
    const pa = Math.max(0, ...a.people.map((p) => p.ask_count)), pb = Math.max(0, ...b.people.map((p) => p.ask_count))
    return pb - pa || b.score - a.score
  })
}
export function quickWins() { return listTasks({ effort: "quick", blocked: false }) }
// Deep work, best first: untouched the longest floats up so nothing silently rots.
export function chipAway() {
  return listTasks({ effort: "deep", blocked: false }).sort((a, b) => b.score - a.score || a.updated_at.localeCompare(b.updated_at))
}

// ---- inbox: proposals from the daily sweep (or anyone). Accepting a new_task proposal creates the task. ----
export function proposeItem({ kind, title, body = "", url = "", task_id = null, suggested = null, added_by = "me" }) {
  if (!INBOX_KINDS.includes(kind)) throw new Error(`kind must be one of ${INBOX_KINDS.join(", ")}`)
  if (!title?.trim()) throw new Error("title is required")
  if (task_id != null && !row("SELECT 1 FROM tasks WHERE id = ?", task_id)) throw new Error(`No task with id ${task_id}`)
  if (url) detectKind(url)
  const dup = url ? row("SELECT * FROM inbox WHERE url = ? AND status = 'new'", url) : null
  if (dup) return dup
  const r = run("INSERT INTO inbox (kind, title, body, url, task_id, suggested, status, added_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
    kind, title.trim(), body, url, task_id, suggested ? JSON.stringify(suggested) : null, "new", added_by, now())
  return getInboxItem(Number(r.lastInsertRowid))
}
export function getInboxItem(id) {
  const it = row("SELECT * FROM inbox WHERE id = ?", id)
  if (!it) throw new Error(`No inbox item with id ${id}`)
  return { ...it, suggested: it.suggested ? JSON.parse(it.suggested) : null }
}
export function listInbox({ status = "new", kind } = {}) {
  const where = [], args = []
  if (status && status !== "all") { where.push("status = ?"); args.push(status) }
  if (kind) { where.push("kind = ?"); args.push(kind) }
  return rows(`SELECT * FROM inbox ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY created_at DESC`, ...args)
    .map((it) => ({ ...it, suggested: it.suggested ? JSON.parse(it.suggested) : null }))
}
// Accept: new_task → creates the task from `suggested` (overrides win). Others → attaches the url/body to the linked task.
export function acceptItem(id, overrides = {}) {
  const it = getInboxItem(id)
  if (it.status !== "new") throw new Error("Already handled")
  let task = null
  // Anything not tied to an existing task becomes a new task on accept, whatever its kind.
  if (!it.task_id) {
    task = materializeItem(it, overrides)
  } else {
    if (it.url) addLink({ task_id: it.task_id, url: it.url, title: it.title, added_by: it.added_by })
    const { sug, notes } = sanitizeSuggested(it.suggested ?? {})
    const body = [it.body, ...notes].filter(Boolean).join("\n\n")
    if (body) addNote({ task_id: it.task_id, title: it.title, body, added_by: it.added_by })
    for (const url of sug.links ?? []) if (url !== it.url) addLink({ task_id: it.task_id, url, added_by: it.added_by })
    delete sug.links
    delete sug.reopen
    // New evidence on a finished task brings it back instead of spawning a duplicate (unless the proposal says reopen:false).
    const cur = getTask(it.task_id)
    if (cur.status === "done" && it.suggested?.reopen !== false && overrides.status === undefined) sug.status = "todo"
    if (Object.keys(sug).length || Object.keys(overrides).length) updateTask(it.task_id, { ...sug, ...overrides })
    task = getTask(it.task_id)
  }
  run("UPDATE inbox SET status = 'accepted', resolved_at = ?, task_id = ? WHERE id = ?", now(), task?.id ?? null, id)
  return { item: getInboxItem(id), task }
}
// Build a task from a proposal. Assistants sometimes put prose where an enum belongs; keep the prose, don't fail the accept.
function sanitizeSuggested(sug = {}) {
  const out = { ...sug }, notes = []
  if (out.next_action != null && !NEXT_ACTIONS.includes(out.next_action)) { notes.push(`Next step: ${out.next_action}`); delete out.next_action }
  if (out.effort != null && !EFFORTS.includes(out.effort)) delete out.effort
  if (out.priority != null && !(Number.isInteger(+out.priority) && +out.priority >= 1 && +out.priority <= 4)) delete out.priority
  if (out.impact != null && !(Number.isInteger(+out.impact) && +out.impact >= 1 && +out.impact <= 5)) delete out.impact
  if (out.due_date != null && !/^\d{4}-\d{2}-\d{2}$/.test(out.due_date)) delete out.due_date
  return { sug: out, notes }
}
export function materializeItem(it, overrides = {}) {
  const { sug, notes } = sanitizeSuggested(it.suggested)
  const description = [it.body, ...notes].filter(Boolean).join("\n\n")
  const task = createTask({ title: it.title, description, ...sug, ...overrides, links: [...(sug.links ?? []), ...(it.url ? [it.url] : [])], added_by: it.added_by })
  run("UPDATE inbox SET task_id = ? WHERE id = ?", task.id, it.id)
  return task
}
export function dismissItem(id) {
  getInboxItem(id)
  run("UPDATE inbox SET status = 'dismissed', resolved_at = ? WHERE id = ?", now(), id)
  return getInboxItem(id)
}

export function calendar(from, to) {
  checkDate(from); checkDate(to)
  return listTasks({ include_done: true, due_after: from, due_before: to })
}

export function projects() {
  return rows("SELECT project, COUNT(*) c FROM tasks WHERE project != '' AND status != 'done' GROUP BY project ORDER BY project").map((r) => r.project)
}

// ---- handoff docs: the quick-reference an assistant reads first and rewrites when it finishes a chunk of work ----
export function updateHandoff(id, { handoff, append, updated_by = "me" }) {
  const cur = row("SELECT handoff FROM tasks WHERE id = ?", id)
  if (!cur) throw new Error(`No task with id ${id}`)
  const body = append ? `${cur.handoff}${cur.handoff ? "\n\n" : ""}${append}` : handoff ?? ""
  return updateTask(id, { handoff: body, updated_by })
}
export function getProject(name) {
  const open = listTasks({ project: name })
  const done = listTasks({ project: name, status: "done" }).slice(0, 10)
  if (!open.length && !done.length && !row("SELECT 1 FROM project_handoffs WHERE project = ?", name)) throw new Error(`No project named ${name}`)
  const h = row("SELECT * FROM project_handoffs WHERE project = ?", name)
  const allLinks = rows("SELECT l.* FROM links l JOIN tasks t ON t.id = l.task_id WHERE t.project = ? COLLATE NOCASE ORDER BY l.created_at DESC", name)
  return {
    project: name,
    handoff: h?.handoff ?? "",
    handoff_updated_at: h?.updated_at ?? null,
    handoff_updated_by: h?.updated_by ?? "",
    handoff_stale: !h || open.some((t) => t.updated_at > h.updated_at),
    open_tasks: open.map((t) => ({ ...slim(t), handoff_stale: t.handoff_stale, is_blocked: t.is_blocked })),
    recently_done: done.map(slim),
    sources: allLinks,
    channels: [...new Set(open.flatMap((t) => t.channels))],
    skills: [...new Set(open.flatMap((t) => t.skills))],
    people: [...new Set(open.flatMap((t) => t.people.map((p) => p.name)))],
  }
}
export function updateProjectHandoff(name, { handoff, append, updated_by = "me" }) {
  if (!name?.trim()) throw new Error("project name is required")
  const cur = row("SELECT handoff FROM project_handoffs WHERE project = ?", name)
  const body = append ? `${cur?.handoff ?? ""}${cur?.handoff ? "\n\n" : ""}${append}` : handoff ?? ""
  run(`INSERT INTO project_handoffs (project, handoff, updated_at, updated_by) VALUES (?,?,?,?)
       ON CONFLICT(project) DO UPDATE SET handoff = excluded.handoff, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    name.trim(), body, now(), updated_by)
  return getProject(name.trim())
}
// ---- daily sweep support: config lives in the "Daily sweep" project handoff; run history in standalone "sweep-log" notes ----
export const SWEEP_PROJECT = "Daily sweep"
export function getSweepConfig() {
  const cfg = row("SELECT * FROM project_handoffs WHERE project = ?", SWEEP_PROJECT)
  const last = row("SELECT * FROM notes WHERE task_id IS NULL AND title = 'sweep-log' ORDER BY created_at DESC LIMIT 1")
  const recent = rows("SELECT id, body, created_at FROM notes WHERE task_id IS NULL AND title = 'sweep-log' ORDER BY created_at DESC LIMIT 5")
  const open = listTasks({})
  return {
    today: today(),
    config: cfg?.handoff ?? "",
    config_updated_at: cfg?.updated_at ?? null,
    last_sweep: last ? { at: last.created_at, body: last.body } : null,
    recent_sweeps: recent,
    watched_channels: [...new Set(open.flatMap((t) => t.channels))],
    open_task_count: open.length,
    inbox_new: row("SELECT COUNT(*) c FROM inbox WHERE status = 'new'").c,
    dismissed_urls: rows("SELECT url FROM inbox WHERE status = 'dismissed' AND url != ''").map((r) => r.url),
    stale_handoffs: staleHandoffs(),
  }
}
export function logSweep({ summary, cutoffs = {}, proposals = 0, run_type = "full", added_by = "me" }) {
  if (!summary?.trim()) throw new Error("summary is required")
  const body = [`run_type: ${run_type}`, `proposals: ${proposals}`, `cutoffs: ${JSON.stringify(cutoffs)}`, "", summary.trim()].join("\n")
  return addNote({ title: "sweep-log", body, added_by })
}
// ---- hero: XP from finished tasks (impact × 10, +5 if it cleared an owe), level, day streak ----
export function hero() {
  const done = rows("SELECT id, impact, completed_at FROM tasks WHERE status = 'done' AND completed_at IS NOT NULL ORDER BY completed_at")
  let xp = 0
  const days = new Set()
  for (const t of done) {
    const owed = row("SELECT 1 FROM task_people WHERE task_id = ? AND role = 'owed_to'", t.id)
    xp += t.impact * 10 + (owed ? 5 : 0)
    days.add(localDay(t.completed_at))
  }
  const level = Math.floor(Math.sqrt(xp / 40)) + 1
  const nextAt = 40 * level * level
  const prevAt = 40 * (level - 1) * (level - 1)
  // streak: consecutive days with a completion, ending today or yesterday
  let streak = 0
  const d = new Date(today() + "T12:00:00")
  if (!days.has(fmtLocal(d))) d.setDate(d.getDate() - 1)
  while (days.has(fmtLocal(d))) { streak++; d.setDate(d.getDate() - 1) }
  const open = listTasks({})
  const mood = open.some((t) => t.asked_twice.length) ? "worried" : open.some((t) => t.overdue) ? "tired" : !open.length ? "asleep" : days.has(today()) ? "happy" : "idle"
  return { xp, level, level_progress: Math.round(((xp - prevAt) / (nextAt - prevAt)) * 100), xp_to_next: nextAt - xp, streak, cleared_today: [...days].filter((x) => x === today()).length ? done.filter((t) => localDay(t.completed_at) === today()).length : 0, total_cleared: done.length, mood }
}
const fmtLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const localDay = (iso) => fmtLocal(new Date(iso))
// ---- backups: a consistent SQLite snapshot per day in <dataDir>/backups, 30 kept. Run by the server on start and hourly. ----
export const backupDir = path.join(dataDir, "backups")
export async function backupNow({ keepDays = 30, force = false } = {}) {
  fs.mkdirSync(backupDir, { recursive: true })
  const name = `tasks-${today()}.db`
  const dest = path.join(backupDir, name)
  if (!force && fs.existsSync(dest)) return { skipped: true, path: dest, kept: listBackups().length }
  await sqliteBackup(db, dest) // online backup: safe while the app and assistants keep writing
  const cutoff = Date.now() - keepDays * 86400000
  for (const f of fs.readdirSync(backupDir)) {
    const m = f.match(/^tasks-(\d{4}-\d{2}-\d{2})\.db$/)
    if (m && new Date(m[1] + "T12:00:00").getTime() < cutoff) fs.unlinkSync(path.join(backupDir, f))
  }
  return { skipped: false, path: dest, kept: listBackups().length }
}
export function listBackups() {
  if (!fs.existsSync(backupDir)) return []
  return fs.readdirSync(backupDir).filter((f) => /^tasks-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().reverse()
    .map((f) => ({ file: f, bytes: fs.statSync(path.join(backupDir, f)).size }))
}
export function staleHandoffs() {
  return listTasks({}).filter((t) => t.handoff_stale && t.status === "in_progress").map(slim)
}
export function search(q) {
  const like = `%${q}%`
  return {
    tasks: rows("SELECT * FROM tasks WHERE title LIKE ? OR description LIKE ? OR context LIKE ? OR channels LIKE ? OR skills LIKE ?", like, like, like, like, like).map(decorate).map(slim),
    notes: listNotes({ query: q }),
    links: rows("SELECT * FROM links WHERE url LIKE ? OR title LIKE ?", like, like),
  }
}
export function skillsInUse() {
  const c = {}
  for (const r of rows("SELECT skills FROM tasks WHERE skills != '' AND status != 'done'")) for (const s of r.skills.split(",")) c[s] = (c[s] || 0) + 1
  return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([skill, count]) => ({ skill, count }))
}
export function channelsInUse() {
  const c = {}
  for (const r of rows("SELECT channels FROM tasks WHERE channels != '' AND status != 'done'")) for (const s of r.channels.split(",")) c[s] = (c[s] || 0) + 1
  return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([channel, count]) => ({ channel, count }))
}
