import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

process.env.TASKS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tt-"))
const s = await import("../src/store.js")

test("recurrence math", () => {
  assert.equal(s.nextDate("2026-10-26", { freq: "daily", interval: 1 }), "2026-10-27")
  assert.equal(s.nextDate("2026-10-26", { freq: "weekly", interval: 1 }), "2026-11-02")
  assert.equal(s.nextDate("2026-10-26", { freq: "weekly", interval: 1, weekdays: [1, 3] }), "2026-10-28") // Mon -> Wed
  assert.equal(s.nextDate("2026-10-28", { freq: "weekly", interval: 1, weekdays: [1, 3] }), "2026-11-02") // Wed -> next Mon
  assert.equal(s.nextDate("2026-01-31", { freq: "monthly", interval: 1 }), "2026-02-28") // clamps to month end
  assert.equal(s.nextDate("2024-02-29", { freq: "yearly", interval: 1 }), "2025-02-28")
})

test("link kind detection", () => {
  assert.equal(s.detectKind("https://claude.ai/chat/abc"), "claude_chat")
  assert.equal(s.detectKind("https://chatgpt.com/c/abc"), "chatgpt_chat")
  assert.equal(s.detectKind("https://posthog.slack.com/archives/C1/p2"), "slack")
  assert.equal(s.detectKind("https://github.com/PostHog/posthog/pull/12"), "github_pr")
  assert.equal(s.detectKind("https://github.com/PostHog/posthog/issues/12"), "github_issue")
  assert.equal(s.detectKind("https://example.com"), "link")
  assert.throws(() => s.detectKind("not a url"))
})

test("create, block, complete, recur", () => {
  const a = s.createTask({ title: "A", priority: 1, impact: 5, due_date: "2020-01-01", waiting_on: ["Cory"], links: ["https://claude.ai/chat/1"] })
  assert.equal(a.is_blocked, true)
  assert.equal(a.overdue, true)
  assert.equal(a.links[0].kind, "claude_chat")
  s.setPerson({ task_id: a.id, name: "Cory", role: "waiting_on", resolved: true })
  assert.equal(s.getTask(a.id).is_blocked, false)

  const b = s.createTask({ title: "B" })
  s.addDependency(b.id, a.id)
  assert.equal(s.getTask(b.id).is_blocked, true)
  assert.throws(() => s.addDependency(a.id, b.id), /loop/)
  s.completeTask(a.id)
  assert.equal(s.getTask(b.id).is_blocked, false)

  const r = s.createTask({ title: "Weekly", due_date: "2020-01-06", recurrence: { freq: "weekly" } })
  const { task, next } = s.completeTask(r.id)
  assert.equal(task.status, "done")
  assert.ok(next && next.due_date > s.today(), "next occurrence lands in the future")
  assert.equal(next.recurrence.freq, "weekly")
  assert.equal(s.completeTask(r.id).next, null, "completing twice doesn't spawn again")
})

test("sorting puts overdue urgent work first", () => {
  const low = s.createTask({ title: "low", priority: 4, impact: 1 })
  const hot = s.createTask({ title: "hot", priority: 1, impact: 5, due_date: "2020-01-01" })
  const ids = s.listTasks().map((t) => t.id)
  assert.ok(ids.indexOf(hot.id) < ids.indexOf(low.id))
})

test("context fields, quick wins, asked twice", () => {
  const t = s.createTask({ title: "ctx", effort: "quick", next_action: "slack_reply", context: "# Why\nBecause.", channels: ["#ads"], skills: ["bing-ads"], links: ["https://docs.google.com/spreadsheets/d/1", "https://posthog.com/rfcs/123"] })
  assert.deepEqual(t.channels, ["#ads"])
  assert.deepEqual(t.skills, ["bing-ads"])
  assert.deepEqual(t.links.map((l) => l.kind), ["google_sheet", "rfc"])
  assert.ok(s.quickWins().some((x) => x.id === t.id))
  s.updateTask(t.id, { append_context: "More." })
  assert.equal(s.getTask(t.id).context, "# Why\nBecause.\n\nMore.")
  s.setPerson({ task_id: t.id, name: "Mine", asked: true })
  s.setPerson({ task_id: t.id, name: "Mine", asked: true })
  assert.deepEqual(s.getTask(t.id).asked_twice, ["Mine"])
  assert.ok(s.briefing().asked_twice.some((x) => x.id === t.id))
  assert.throws(() => s.createTask({ title: "x", effort: "huge" }), /effort/)
})

test("inbox propose → accept creates a task", () => {
  const it = s.proposeItem({ kind: "new_task", title: "Turn PPM banner into ad", url: "https://www.figma.com/file/abc", suggested: { effort: "quick", project: "Paid ads" }, added_by: "chatgpt" })
  assert.equal(it.status, "new")
  assert.equal(s.proposeItem({ kind: "new_task", title: "dupe", url: "https://www.figma.com/file/abc" }).id, it.id, "same url is deduped")
  const { task } = s.acceptItem(it.id, { priority: 2 })
  assert.equal(task.effort, "quick"); assert.equal(task.priority, 2); assert.equal(task.added_by, "chatgpt")
  assert.equal(task.links[0].kind, "figma")
  assert.equal(s.listInbox().length, 0)
  const up = s.proposeItem({ kind: "update", title: "Cory replied", task_id: task.id, url: "https://x.slack.com/archives/C1/p1", body: "He signed off." })
  s.acceptItem(up.id)
  const after = s.getTask(task.id)
  assert.equal(after.links.length, 2); assert.equal(after.notes.length, 1)
  assert.throws(() => s.acceptItem(up.id), /Already/)
  const miss = s.proposeItem({ kind: "missing", title: "Dropped thread", url: "https://x.slack.com/archives/C7/p7", suggested: { effort: "quick" } })
  const r = s.acceptItem(miss.id)
  assert.ok(r.task && r.task.title === "Dropped thread", "a 'missing' proposal with no task becomes a task on accept")
  assert.equal(r.task.links[0].kind, "slack")
  const prose = s.proposeItem({ kind: "follow_up", title: "Prose action", suggested: { next_action: "Tell Joe the sitelinks are done", effort: "quick" } })
  const r2 = s.acceptItem(prose.id)
  assert.equal(r2.task.next_action, "", "invalid next_action is dropped, not fatal")
  assert.match(r2.task.description, /Next step: Tell Joe/)
  // an update tied to an existing task with prose in next_action must still accept
  const up2 = s.proposeItem({ kind: "update", title: "Jack asked again", task_id: task.id, url: "https://x.slack.com/archives/C1/p2", suggested: { priority: 1, next_action: "Reply to Jack with a time", links: ["https://docs.google.com/document/d/zz"] } })
  const r3 = s.acceptItem(up2.id)
  assert.equal(r3.task.priority, 1); assert.equal(r3.task.next_action, "")
  assert.match(r3.task.notes.at(-1).body, /Next step: Reply to Jack/)
  assert.ok(r3.task.links.some((l) => l.kind === "google_doc"), "suggested links attach to the existing task")
  // new evidence on a finished task reopens it rather than creating a duplicate
  s.completeTask(task.id)
  const back = s.proposeItem({ kind: "update", title: "Finished task may be back", task_id: task.id, url: "https://x.slack.com/archives/C1/p3", body: "Figma file revised again" })
  const r4 = s.acceptItem(back.id)
  assert.equal(r4.task.status, "todo"); assert.equal(r4.task.id, task.id)
  s.completeTask(task.id)
  const quiet = s.proposeItem({ kind: "update", title: "FYI only", task_id: task.id, url: "https://x.slack.com/archives/C1/p4", suggested: { reopen: false } })
  assert.equal(s.acceptItem(quiet.id).task.status, "done", "reopen:false just attaches")
})

test("handoff docs go stale when the task moves", () => {
  const t = s.createTask({ title: "h", project: "Proj", status: "in_progress" })
  assert.equal(t.handoff_stale, true, "no handoff yet")
  s.updateHandoff(t.id, { handoff: "## Current state\nStarted.", updated_by: "claude" })
  let g = s.getTask(t.id)
  assert.equal(g.handoff_stale, false)
  assert.equal(g.handoff_updated_by, "claude")
  s.addNote({ task_id: t.id, body: "did a thing" })
  assert.equal(s.getTask(t.id).handoff_stale, true, "a note after the handoff makes it stale")
  assert.ok(s.staleHandoffs().some((x) => x.id === t.id))
  s.updateHandoff(t.id, { append: "## Next steps\n1. More." })
  g = s.getTask(t.id)
  assert.match(g.handoff, /Started\.\n\n## Next steps/)
  assert.equal(g.handoff_stale, false)

  const p = s.updateProjectHandoff("Proj", { handoff: "Standing decisions.", updated_by: "chatgpt" })
  assert.equal(p.handoff_stale, false)
  assert.equal(p.open_tasks.length, 1)
  s.updateTask(t.id, { priority: 1 })
  assert.equal(s.getProject("Proj").handoff_stale, true)
  assert.throws(() => s.getProject("Nope"), /No project/)
})

test("sweep config and log", () => {
  s.updateProjectHandoff(s.SWEEP_PROJECT, { handoff: "channels: #a" })
  const it = s.proposeItem({ kind: "missing", title: "x", url: "https://x.slack.com/archives/C9/p9" })
  s.dismissItem(it.id)
  let c = s.getSweepConfig()
  assert.equal(c.config, "channels: #a")
  assert.equal(c.last_sweep, null)
  assert.ok(c.dismissed_urls.includes("https://x.slack.com/archives/C9/p9"))
  s.logSweep({ summary: "ran", cutoffs: { slack: "2026-10-26T15:00:00Z" }, proposals: 3, added_by: "codex" })
  c = s.getSweepConfig()
  assert.match(c.last_sweep.body, /proposals: 3/)
  assert.match(c.last_sweep.body, /slack/)
})

test("you owe people", () => {
  const a = s.createTask({ title: "owe explicit", owed_to: ["Charles"] })
  const b = s.createTask({ title: "owe by action", next_action: "slack_reply" })
  const c = s.createTask({ title: "not owed" })
  const ids = s.owed().map((t) => t.id)
  assert.ok(ids.includes(a.id) && ids.includes(b.id) && !ids.includes(c.id))
  assert.deepEqual(s.getTask(a.id).owed_to, ["Charles"])
  s.setPerson({ task_id: a.id, name: "Charles", role: "owed_to", resolved: true })
  assert.ok(!s.owed().some((t) => t.id === a.id), "resolved owed_to drops out")
  assert.ok(s.briefing().you_owe.some((t) => t.id === b.id))
})

test("hero stats and progress", () => {
  const h0 = s.hero()
  const t = s.createTask({ title: "quest", impact: 5, effort: "deep", status: "in_progress" })
  assert.ok(s.getTask(t.id).progress >= 15, "in-progress estimate")
  s.updateTask(t.id, { progress: 60 })
  assert.equal(s.getTask(t.id).progress, 60)
  s.completeTask(t.id)
  const h1 = s.hero()
  assert.equal(h1.xp - h0.xp, 50)
  assert.ok(h1.streak >= 1)
  assert.ok(h1.cleared_today >= 1)
  assert.throws(() => s.updateTask(t.id, { progress: 140 }), /progress/)
})

test("daily backup writes one snapshot and prunes old ones", async () => {
  fs.mkdirSync(s.backupDir, { recursive: true })
  fs.writeFileSync(path.join(s.backupDir, "tasks-2020-01-01.db"), "old")
  const r1 = await s.backupNow()
  assert.equal(r1.skipped, false)
  assert.ok(fs.statSync(r1.path).size > 0)
  assert.ok(!fs.existsSync(path.join(s.backupDir, "tasks-2020-01-01.db")), "31+ day old backup pruned")
  const r2 = await s.backupNow()
  assert.equal(r2.skipped, true, "second run same day is a no-op")
  assert.equal(s.listBackups().length, 1)
})

test("closing notes land in notes and handoff", () => {
  const t = s.createTask({ title: "close me", handoff: "## Current state\nalmost" })
  s.updateHandoff(t.id, { handoff: "## Current state\nalmost" })
  const { task } = s.completeTask(t.id, { closing_notes: "Shipped v2; Cory signed off.", added_by: "claude" })
  assert.equal(task.status, "done")
  assert.equal(task.notes.at(-1).title, "Closing notes")
  assert.match(task.handoff, /^## Outcome \(\d{4}-\d{2}-\d{2}\)\nShipped v2/)
  assert.match(task.handoff, /Current state/)
})

test("validation", () => {
  assert.throws(() => s.createTask({ title: "" }), /title/)
  assert.throws(() => s.createTask({ title: "x", priority: 9 }), /priority/)
  assert.throws(() => s.createTask({ title: "x", due_date: "tomorrow" }), /date/)
  assert.throws(() => s.getTask(99999), /No task/)
})
