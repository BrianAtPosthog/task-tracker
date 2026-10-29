import { sprite, npc } from "./sprites.js"
// Plain JS, no build step. Talks to /api on the same server.
const $ = (s, el = document) => el.querySelector(s)
const api = async (path, opts = {}) => {
  const r = await fetch("/api" + path, { headers: { "content-type": "application/json" }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined })
  const j = await r.json()
  if (!r.ok) { toast(j.error || "Something went wrong"); throw new Error(j.error) }
  return j
}
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))
const pad = (n) => String(n).padStart(2, "0")
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const todayStr = () => ymd(new Date())
const KIND_LABEL = { claude_chat: "Claude", claude_artifact: "Claude artifact", chatgpt_chat: "ChatGPT", slack: "Slack", email: "Email", github_pr: "PR", github_issue: "Issue", github: "GitHub", rfc: "RFC", google_doc: "Doc", google_sheet: "Sheet", google_slides: "Slides", google_drive: "Drive", granola: "Granola", figma: "Figma", notion: "Notion", linear: "Linear", posthog: "PostHog", link: "Link" }
const STATUS_LABEL = { todo: "To do", in_progress: "In progress", blocked: "Blocked", done: "Done" }
const ACTION_LABEL = { slack_reply: "Slack reply", email_reply: "Email reply", creative_review: "Creative review", write: "Write", build: "Build", decide: "Decide", meeting: "Meeting", research: "Research", wait: "Wait" }
const EFFORT_LABEL = { quick: "⚡ Quick", medium: "Medium", deep: "⛏ Deep" }
const INBOX_LABEL = { new_task: "New task", update: "Update", missing: "Possibly missed", asset: "New creative", follow_up: "Follow-up" }
const LINK_GROUP = { claude_chat: "Conversations", claude_artifact: "Conversations", chatgpt_chat: "Conversations", slack: "Slack", email: "Email", github_pr: "GitHub", github_issue: "GitHub", github: "GitHub", rfc: "RFCs", google_doc: "Docs & sheets", google_sheet: "Docs & sheets", google_slides: "Docs & sheets", google_drive: "Docs & sheets", notion: "Docs & sheets", granola: "Meeting notes", figma: "Creative", linear: "Other", posthog: "Other", link: "Other" }
// Stable color per project name so the same project always looks the same.
const PALETTE = ["#2f6fed", "#2d8a4e", "#c2185b", "#ef6c00", "#7c4dcc", "#00838f", "#b23121", "#6d4c41", "#558b2f", "#4a154b"]
const projectColor = (p) => { if (!p) return "var(--line)"; let h = 0; for (const c of p) h = (h * 31 + c.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length] }
const PRI_LABEL = { 1: "Urgent", 2: "High", 3: "Normal", 4: "Low" }
const niceDate = (s) => { if (!s) return ""; const [y, m, d] = s.split("-"); return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" }) }
const recText = (r) => {
  if (!r) return ""
  const every = r.interval > 1 ? `every ${r.interval} ` : ""
  const unit = { daily: "day", weekly: "week", monthly: "month", yearly: "year" }[r.freq]
  const dows = r.weekdays?.length ? " on " + r.weekdays.map((d) => "SMTWTFS"[d]).join("") : ""
  return r.interval > 1 ? `${every}${unit}s${dows}` : `${r.freq}${dows}`
}

const CHEERS = ["Nice one!", "Done and dusted.", "That's a win.", "Boom.", "Crushed it.", "One less thing.", "Look at you go.", "Ship it. Oh wait, you did."]
function celebrate(title) {
  const t = document.createElement("div"); t.className = "toast happy"
  t.textContent = `🎉 ${CHEERS[Math.floor(Math.random() * CHEERS.length)]} "${title.length > 40 ? title.slice(0, 40) + "…" : title}" is done.`
  document.querySelectorAll(".toast").forEach((x) => x.remove()); document.body.appendChild(t); setTimeout(() => t.remove(), 3200)
  confetti()
  if (state.mode === "quest") jingle()
  if ("Notification" in window && Notification.permission === "granted") new Notification("Task done 🎉", { body: title, silent: true })
}
function jingle() {
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)()
    const notes = [523, 659, 784, 1047]
    notes.forEach((f, i) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = "square"; o.frequency.value = f; g.gain.value = 0.05; o.connect(g); g.connect(ac.destination); o.start(ac.currentTime + i * 0.09); o.stop(ac.currentTime + i * 0.09 + 0.12) })
  } catch {}
}
function confetti() {
  const c = $("#confetti"), ctx = c.getContext("2d")
  c.width = innerWidth; c.height = innerHeight
  const colors = ["#2f6fed", "#2d8a4e", "#c2185b", "#ef6c00", "#7c4dcc", "#ffd600"]
  const bits = Array.from({ length: 120 }, () => ({ x: innerWidth / 2, y: innerHeight * 0.4, vx: (Math.random() - 0.5) * 18, vy: -Math.random() * 14 - 4, r: Math.random() * 6 + 3, c: colors[Math.floor(Math.random() * colors.length)], a: Math.random() * Math.PI, s: (Math.random() - 0.5) * 0.3 }))
  let frame = 0
  const tick = () => {
    ctx.clearRect(0, 0, c.width, c.height)
    for (const b of bits) { b.vy += 0.35; b.x += b.vx; b.y += b.vy; b.vx *= 0.99; b.a += b.s; ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a); ctx.fillStyle = b.c; ctx.globalAlpha = Math.max(0, 1 - frame / 90); ctx.fillRect(-b.r / 2, -b.r / 2, b.r, b.r * 0.6); ctx.restore() }
    if (++frame < 95) requestAnimationFrame(tick); else ctx.clearRect(0, 0, c.width, c.height)
  }
  requestAnimationFrame(tick)
}
let toastTimer
function toast(msg) {
  let t = $(".toast"); if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t) }
  t.textContent = msg; clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), 2500)
}

const state = { view: "focus", project: null, selected: null, calMonth: new Date(), calMode: "month", filters: { status: "", maxp: "", blocked: "", include_done: false } }

// ---------- rendering tasks ----------
function pills(t) {
  const out = [`<span class="pill p${t.priority}">P${t.priority} ${PRI_LABEL[t.priority]}</span>`, `<span class="pill impact">Impact ${t.impact}</span>`]
  if (t.effort && t.effort !== "medium") out.push(`<span class="pill effort-${t.effort}">${EFFORT_LABEL[t.effort]}</span>`)
  if (t.next_action) out.push(`<span class="pill action action-${t.next_action}">${ACTION_LABEL[t.next_action]}</span>`)
  if (t.status !== "todo") out.push(`<span class="pill status">${STATUS_LABEL[t.status]}</span>`)
  if (t.overdue) out.push(`<span class="pill overdue">Overdue · ${niceDate(t.due_date)}</span>`)
  else if (t.due_date === todayStr()) out.push(`<span class="pill due-today">Due today</span>`)
  else if (t.due_date) out.push(`<span class="pill">Due ${niceDate(t.due_date)}</span>`)
  if (t.owed_to?.length) out.push(`<span class="pill owed">You owe: ${esc(t.owed_to.join(", "))}</span>`)
  if (t.is_blocked) out.push(`<span class="pill blocked">Waiting: ${esc([...t.blocked_by.people, ...t.blocked_by.tasks.map((x) => "#" + x.id)].join(", "))}</span>`)
  if (t.recurrence) out.push(`<span class="pill repeat">↻ ${esc(recText(t.recurrence))}</span>`)
  if (t.handoff_stale && t.status === "in_progress") out.push(`<span class="pill stale" title="Handoff doc is missing or older than the last change">Handoff stale</span>`)
  if (t.asked_twice?.length) out.push(`<span class="pill asked">Asked ${t.people.find((p) => p.name === t.asked_twice[0])?.ask_count}× by ${esc(t.asked_twice.join(", "))}</span>`)
  if (t.project) out.push(`<span class="pill project" style="border-left-color:${projectColor(t.project)}">${esc(t.project)}</span>`)
  for (const sk of t.skills || []) out.push(`<span class="pill skill">${esc(sk)}</span>`)
  for (const [k, n] of Object.entries(t.link_counts || {})) out.push(`<span class="pill kind">${KIND_LABEL[k] || k}${n > 1 ? " ×" + n : ""}</span>`)
  return out.join("")
}
function taskRow(t) {
  return `<div class="task ${t.status === "done" ? "done" : ""} ${state.selected === t.id ? "selected" : ""}" data-id="${t.id}" style="border-left-color:${projectColor(t.project)}">
    <button class="check" data-complete="${t.id}" title="Mark done"></button>
    <div><div class="title">${esc(t.title)}</div><div class="meta">${pills(t)}</div></div>
    <div class="right">${t.status === "done" && t.completed_at ? `✓ ${niceDate(t.completed_at.slice(0, 10))}<br>` : ""}#${t.id}</div></div>`
}
function taskList(tasks, emptyMsg = "Nothing here.") {
  return tasks.length ? `<div class="task-list">${tasks.map(taskRow).join("")}</div>` : `<div class="empty">${emptyMsg}</div>`
}

// ---------- views ----------
const views = {
  async focus() {
    const b = await api("/briefing")
    const all = await api("/tasks")
    const ids = new Set()
    const section = (title, list, msg) => { list = list.filter((t) => !ids.has(t.id)); list.forEach((t) => ids.add(t.id)); return list.length || msg ? `<h3>${title}</h3>${taskList(list, msg)}` : "" }
    const byId = Object.fromEntries(all.map((t) => [t.id, t]))
    const full = (l) => l.map((x) => byId[x.id]).filter(Boolean)
    return `<h2>Today · ${new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</h2>
      <p class="muted">${b.counts.open} open, ${b.counts.blocked} waiting on someone or something.</p>
      ${b.inbox_new ? `<p><a href="#" data-goto="inbox">📥 ${b.inbox_new} new proposal${b.inbox_new > 1 ? "s" : ""} in your Inbox</a></p>` : ""}
      ${section("Someone's asked twice", full(b.asked_twice))}
      ${section("Overdue", full(b.overdue))}
      ${section("Due today", full(b.due_today))}
      ${section("💸 You owe people", full(b.you_owe))}
      ${section("Focus next", full(b.top_focus), "Add a task and it'll show up here.")}
      ${section("⚡ Quick wins", full(b.quick_wins))}
      ${Object.entries(b.by_next_action).filter(([k]) => ["slack_reply", "email_reply", "creative_review", "decide"].includes(k)).map(([k, l]) => section(`Just needs: ${ACTION_LABEL[k]}`, full(l))).join("")}
      ${section("Waiting on people", full(b.waiting_on_people))}`
  },
  async project() {
    const p = await api("/projects/" + encodeURIComponent(state.project))
    const list = await views.list()
    return `<div class="project-page"><h2>${esc(state.project)}</h2>
      <div class="meta-row">${p.channels.map((c) => `<span class="pill channel">${esc(c)}</span>`).join("")}${p.skills.map((c) => `<span class="pill skill">${esc(c)}</span>`).join("")}${p.people.map((c) => `<span class="pill">${esc(c)}</span>`).join("")}</div>
      ${handoffBlock({ handoff: p.handoff, updated_at: p.handoff_updated_at, updated_by: p.handoff_updated_by, stale: p.handoff_stale }, `/projects/${encodeURIComponent(state.project)}/handoff`, "p")}
      ${p.sources.length ? `<h3>All sources (${p.sources.length})</h3>${groupedLinks(p.sources).replace(/data-del-link/g, "data-nodel")}` : ""}
      </div>${list.replace(/^<h2>.*?<\/h2>/, "")}`
  },
  async list() {
    const f = state.filters
    const q = new URLSearchParams()
    if (state.project) q.set("project", state.project)
    if (f.status) q.set("status", f.status)
    if (f.maxp) q.set("max_priority", f.maxp)
    if (f.blocked) q.set("blocked", f.blocked)
    if (f.include_done) q.set("include_done", "true")
    const tasks = await api("/tasks?" + q)
    return `<h2>${state.project ? esc(state.project) : "All tasks"} <span class="muted" style="font-weight:400;font-size:13px">${tasks.length}</span></h2>
      <div class="filters">
        <select data-f="status"><option value="">Any status</option>${Object.entries(STATUS_LABEL).map(([k, v]) => `<option value="${k}" ${f.status === k ? "selected" : ""}>${v}</option>`).join("")}</select>
        <select data-f="maxp"><option value="">Any priority</option><option value="1" ${f.maxp === "1" ? "selected" : ""}>Urgent only</option><option value="2" ${f.maxp === "2" ? "selected" : ""}>Urgent + high</option></select>
        <select data-f="blocked"><option value="">Blocked or not</option><option value="true" ${f.blocked === "true" ? "selected" : ""}>Blocked only</option><option value="false" ${f.blocked === "false" ? "selected" : ""}>Ready to work</option></select>
        <label style="display:flex;gap:4px;align-items:center;font-size:13px"><input type="checkbox" data-f="include_done" ${f.include_done ? "checked" : ""}/> Show done</label>
      </div>${taskList(tasks)}`
  },
  async calendar() {
    const m = state.calMonth
    let start, end, cells
    if (state.calMode === "week") {
      start = new Date(m); start.setDate(m.getDate() - ((m.getDay() + 6) % 7))
      end = new Date(start); end.setDate(start.getDate() + 6); cells = 7
    } else {
      const first = new Date(m.getFullYear(), m.getMonth(), 1)
      start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7))
      end = new Date(start); end.setDate(start.getDate() + 41); cells = 42
    }
    const tasks = await api(`/calendar?from=${ymd(start)}&to=${ymd(end)}`)
    const byDay = {}
    for (const t of tasks) (byDay[t.due_date] ??= []).push(t)
    const title = state.calMode === "week" ? `${niceDate(ymd(start))} – ${niceDate(ymd(end))}` : m.toLocaleDateString(undefined, { month: "long", year: "numeric" })
    let html = `<div class="cal-head"><h2>${title}</h2>
      <button class="ghost sm" data-cal="prev">‹</button><button class="ghost sm" data-cal="today">Today</button><button class="ghost sm" data-cal="next">›</button>
      <select data-cal="mode"><option value="month" ${state.calMode === "month" ? "selected" : ""}>Month</option><option value="week" ${state.calMode === "week" ? "selected" : ""}>Week</option></select></div>
      <div class="cal ${state.calMode === "week" ? "cal-week" : ""}">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => `<div class="dow">${d}</div>`).join("")}`
    for (let i = 0; i < cells; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i)
      const key = ymd(d)
      const other = state.calMode === "month" && d.getMonth() !== m.getMonth()
      html += `<div class="day ${other ? "other" : ""} ${key === todayStr() ? "today" : ""}" data-day="${key}"><div class="n">${d.getDate()}</div>
        ${(byDay[key] || []).map((t) => `<div class="ev p${t.priority} ${t.status === "done" ? "done" : ""} ${t.overdue ? "overdue" : ""}" data-id="${t.id}" title="${esc(t.title)}">${esc(t.title)}</div>`).join("")}</div>`
    }
    return html + "</div><p class='muted' style='margin-top:8px'>Double-click a day to add a task due that day.</p>"
  },
  async owed() {
    const tasks = await api("/owed")
    const byPerson = {}
    for (const t of tasks) for (const n of [...new Set([...t.owed_to, ...t.people.filter((p) => p.ask_count > 0 && !p.resolved).map((p) => p.name)])]) (byPerson[n] ??= []).push(t)
    const unnamed = tasks.filter((t) => !t.owed_to.length && !t.people.some((p) => p.ask_count > 0 && !p.resolved))
    return `<h2>💸 Stuff you owe people <span class="muted" style="font-weight:400;font-size:13px">${tasks.length} · most-pinged first</span></h2>
      ${Object.keys(byPerson).length ? Object.entries(byPerson).sort((a, b) => b[1].length - a[1].length).map(([n, l]) => `<h3>${esc(n)} <span class="muted" style="font-weight:400">· ${l.length}</span></h3>${taskList(l)}`).join("") : ""}
      ${unnamed.length ? `<h3>Replies you owe (no one named yet)</h3>${taskList(unnamed)}` : ""}
      ${!tasks.length ? `<div class="empty">Nobody's waiting on you. Enjoy it.</div>` : ""}`
  },
  async quick() {
    const tasks = await api("/quick-wins")
    return `<h2>⚡ Quick wins <span class="muted" style="font-weight:400;font-size:13px">${tasks.length} unblocked, under ~20 min each</span></h2>${taskList(tasks, "Nothing marked quick. Set Effort to Quick on small tasks and they'll land here.")}`
  },
  async deep() {
    const tasks = await api("/chip-away")
    return `<h2>⛏ Chip away <span class="muted" style="font-weight:400;font-size:13px">deep work, least-recently-touched first</span></h2>${taskList(tasks, "Nothing marked deep. Big multi-session projects go here.")}`
  },
  async inbox() {
    const raw = await api("/inbox?status=" + (state.inboxStatus || "new"))
    const { items, controls } = inboxPrep(raw)
    const all = await api("/tasks?include_done=true")
    const tasks = Object.fromEntries(all.map((t) => [t.id, t.title])), doneIds = new Set(all.filter((t) => t.status === "done").map((t) => t.id))
    const sug = (x) => x ? Object.entries(x).filter(([k]) => !["links", "priority", "impact", "effort", "next_action", "project", "due_date", "reopen"].includes(k)).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`).join(" · ") : ""
    return `<h2>Inbox <span class="muted" style="font-weight:400;font-size:13px">proposals from your daily sweep. Accept to create or update, dismiss to drop.</span></h2>
      ${controls}
      <div class="filters"><select data-inbox-status><option value="new" ${(state.inboxStatus || "new") === "new" ? "selected" : ""}>New</option><option value="accepted" ${state.inboxStatus === "accepted" ? "selected" : ""}>Accepted</option><option value="dismissed" ${state.inboxStatus === "dismissed" ? "selected" : ""}>Dismissed</option></select></div>
      ${items.length ? items.map((it) => `<div class="inbox-item kind-${it.kind}">
        <div class="head"><span class="pill">${INBOX_LABEL[it.kind]}</span><strong>${esc(it.title)}</strong>${it.task_id ? `<span class="pill ${doneIds.has(it.task_id) ? "owed" : ""}" title="Accepting adds this to the existing task; nothing new is created">${doneIds.has(it.task_id) ? "reopens finished" : "adds to"} <a href="#" data-id="${it.task_id}">#${it.task_id} ${esc(tasks[it.task_id] || "")}</a></span>` : ""}<span class="muted" style="margin-left:auto;font-size:11px">${esc(it.added_by)} · ${new Date(it.created_at).toLocaleString()}</span></div>
        ${suggestionBadges(it.suggested)}
        ${it.body ? `<div class="body">${esc(it.body)}</div>` : ""}
        ${it.url ? `<div><a href="${esc(it.url)}" target="_blank">${esc(it.url.replace(/^https?:\/\//, "").slice(0, 80))}</a></div>` : ""}
        ${sug(it.suggested) ? `<div class="suggested">Also: ${esc(sug(it.suggested))}</div>` : ""}
        ${it.status === "new" ? `<div class="actions"><button class="primary sm" data-accept="${it.id}">${it.task_id ? (doneIds.has(it.task_id) ? "Reopen task" : "Add to task") : "Accept"}</button><button class="ghost sm" data-dismiss="${it.id}">Dismiss</button></div>` : ""}</div>`).join("") : `<div class="empty">${(state.inboxStatus || "new") === "new" ? "Inbox zero. Your daily sweep will drop proposals here." : "Nothing here."}</div>`}`
  },
  async victory() {
    const done = (await api("/tasks?status=done")).sort((a, b) => (b.completed_at || "").localeCompare(a.completed_at || ""))
    const q = (state.victoryQuery || "").toLowerCase()
    const shown = q ? done.filter((t) => (t.title + " " + t.project).toLowerCase().includes(q)) : done
    const weekKey = (iso) => { const d = new Date(iso); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return ymd(d) }
    const since = (days) => done.filter((t) => t.completed_at && Date.now() - new Date(t.completed_at) < days * 86400000).length
    const groups = {}
    for (const t of shown) (groups[t.completed_at ? weekKey(t.completed_at) : "earlier"] ??= []).push(t)
    const label = (k) => k === "earlier" ? "Earlier" : k === weekKey(new Date().toISOString()) ? "This week" : `Week of ${niceDate(k)}`
    return `<h2>🏆 Victory pile</h2>
      <div class="victory-stats"><div class="stat"><b>${since(7)}</b><span>this week</span></div><div class="stat"><b>${since(30)}</b><span>last 30 days</span></div><div class="stat"><b>${done.length}</b><span>all time</span></div></div>
      <div class="filters"><input data-victory-q placeholder="Search finished tasks…" value="${esc(state.victoryQuery || "")}" /><span class="muted" style="font-size:12px">Click a task to see its handoff and links. Reopen it from the panel if it comes back.</span></div>
      ${shown.length ? Object.entries(groups).map(([k, l]) => `<div class="victory-week">${label(k)} · ${l.length}</div>${taskList(l)}`).join("") : `<div class="empty">Nothing finished yet. Go knock out a quick win.</div>`}`
  },
  async people() {
    const people = await api("/people")
    if (!people.length) return `<h2>People</h2><div class="empty">No one yet. Add "waiting on" or collaborators to a task.</div>`
    const cards = await Promise.all(people.map(async (p) => {
      const tasks = await api(`/tasks?person=${encodeURIComponent(p.name)}`)
      return `<div class="person-card"><h3>${esc(p.name)} ${p.contact ? `<span class="muted" style="font-weight:400;font-size:12px">${esc(p.contact)}</span>` : ""}</h3>
        <div class="${p.owed_count ? "owe" : p.waiting_on_count ? "wait" : "muted"}">${[p.owed_count ? `You owe them ${p.owed_count}` : "", p.waiting_on_count ? `waiting on them for ${p.waiting_on_count}` : "", p.collaborating_count ? `${p.collaborating_count} shared` : ""].filter(Boolean).join(" · ") || "Nothing open"}</div>
        <div style="margin-top:8px">${taskList(tasks, "")}</div></div>`
    }))
    return `<h2>People</h2><div class="people-grid">${cards.join("")}</div>`
  },
  async notes() {
    const notes = await api("/notes")
    const tasks = Object.fromEntries((await api("/tasks?include_done=true")).map((t) => [t.id, t.title]))
    return `<h2>Notes</h2>
      <div class="add-row" style="margin-bottom:14px"><input id="note-title" placeholder="Title (optional)" style="flex:0 0 200px" /><textarea id="note-body" rows="2" placeholder="Standalone note…"></textarea><button class="primary" id="note-add">Add</button></div>
      ${notes.length ? notes.map((n) => `<div class="note" style="margin-bottom:8px">
        ${n.title ? `<strong>${esc(n.title)}</strong>` : ""} ${n.task_id ? `<a href="#" data-id="${n.task_id}">↗ ${esc(tasks[n.task_id] || "task #" + n.task_id)}</a>` : ""}
        <div class="body">${esc(n.body)}</div>
        <div class="by">${esc(n.added_by)} · ${new Date(n.updated_at).toLocaleString()} <button class="x" data-del-note="${n.id}">✕</button></div></div>`).join("") : `<div class="empty">No notes yet.</div>`}`
  },
  async search(q) {
    const r = await api("/search?q=" + encodeURIComponent(q))
    const all = Object.fromEntries((await api("/tasks?include_done=true")).map((t) => [t.id, t]))
    return `<h2>Results for "${esc(q)}"</h2>
      <h3>Tasks</h3>${taskList(r.tasks.map((t) => all[t.id]).filter(Boolean), "No matching tasks.")}
      <h3>Notes</h3>${r.notes.length ? r.notes.map((n) => `<div class="note" style="margin-bottom:6px"><strong>${esc(n.title)}</strong> <a href="#" data-id="${n.task_id}">${n.task_id ? "↗ task #" + n.task_id : ""}</a><div class="body">${esc(n.body)}</div></div>`).join("") : "<div class='muted'>None</div>"}
      <h3>Links</h3>${r.links.length ? r.links.map((l) => `<div><a href="${esc(l.url)}" target="_blank">${esc(l.title || l.url)}</a> <a href="#" data-id="${l.task_id}" class="muted">↗ task #${l.task_id}</a></div>`).join("") : "<div class='muted'>None</div>"}`
  },
}

// Shared inbox ordering/filters for both modes. Suggested fields live in it.suggested.
const EFFORT_RANK = { quick: 0, medium: 1, deep: 2 }
function inboxPrep(items) {
  const f = state.inboxFilters ??= { sort: "priority", kind: "", effort: "", project: "" }
  let out = items.filter((it) => (!f.kind || it.kind === f.kind) && (!f.effort || it.suggested?.effort === f.effort) && (!f.project || (it.suggested?.project || "") === f.project))
  const sg = (it, k, d) => it.suggested?.[k] ?? d
  const sorters = {
    newest: (a, b) => b.created_at.localeCompare(a.created_at),
    priority: (a, b) => sg(a, "priority", 3) - sg(b, "priority", 3) || sg(b, "impact", 3) - sg(a, "impact", 3),
    impact: (a, b) => sg(b, "impact", 3) - sg(a, "impact", 3) || sg(a, "priority", 3) - sg(b, "priority", 3),
    effort: (a, b) => (EFFORT_RANK[sg(a, "effort", "medium")] ?? 1) - (EFFORT_RANK[sg(b, "effort", "medium")] ?? 1) || sg(a, "priority", 3) - sg(b, "priority", 3),
    kind: (a, b) => a.kind.localeCompare(b.kind) || sg(a, "priority", 3) - sg(b, "priority", 3),
  }
  out.sort(sorters[f.sort] || sorters.priority)
  const projects = [...new Set(items.map((it) => it.suggested?.project).filter(Boolean))].sort()
  const opt = (v, label, cur) => `<option value="${esc(v)}" ${cur === v ? "selected" : ""}>${label}</option>`
  const controls = `<div class="filters inbox-controls">
    <select data-if="sort">${[["priority", "Priority first"], ["effort", "Quick first"], ["impact", "Impact first"], ["kind", "By kind"], ["newest", "Newest"]].map(([v, l]) => opt(v, l, f.sort)).join("")}</select>
    <select data-if="kind">${opt("", "All kinds", f.kind)}${Object.entries(INBOX_LABEL).map(([v, l]) => opt(v, l, f.kind)).join("")}</select>
    <select data-if="effort">${opt("", "Any effort", f.effort)}${opt("quick", "⚡ Quick", f.effort)}${opt("medium", "Medium", f.effort)}${opt("deep", "⛏ Deep", f.effort)}</select>
    ${projects.length ? `<select data-if="project">${opt("", "Any project", f.project)}${projects.map((p) => opt(p, p, f.project)).join("")}</select>` : ""}
    <span class="muted" style="font-size:12px">${out.length} of ${items.length}</span></div>`
  return { items: out, controls }
}
function suggestionBadges(sug, pillClass = "pill") {
  if (!sug) return ""
  const b = []
  if (sug.priority) b.push(`<span class="${pillClass} p${sug.priority}">P${sug.priority}</span>`)
  if (sug.impact) b.push(`<span class="${pillClass} impact">Impact ${sug.impact}</span>`)
  if (sug.effort) b.push(`<span class="${pillClass} effort-${sug.effort}">${EFFORT_LABEL[sug.effort]}</span>`)
  if (sug.next_action && ACTION_LABEL[sug.next_action]) b.push(`<span class="${pillClass} action action-${sug.next_action}">${ACTION_LABEL[sug.next_action]}</span>`)
  if (sug.project) b.push(`<span class="${pillClass} project" style="border-left-color:${projectColor(sug.project)}">${esc(sug.project)}</span>`)
  if (sug.due_date) b.push(`<span class="${pillClass}">due ${niceDate(sug.due_date)}</span>`)
  return `<div class="meta" style="display:flex;flex-wrap:wrap;gap:4px;margin:4px 0">${b.join("")}</div>`
}
// ============ QUEST MODE ============
const jw = (title, body, cls = "") => `<section class="jw ${cls}">${title ? `<div class="jw-title">${title}</div>` : ""}<div class="jw-body">${body}</div></section>`
const xpFor = (t) => t.impact * 10 + (t.owed_to?.length ? 5 : 0)
const bar = (pct, cls = "") => `<div class="pbar ${cls}"><div class="pbar-fill" style="width:${Math.max(0, Math.min(100, pct))}%"></div><span>${Math.round(pct)}%</span></div>`
const ICON = { deep: "sword", quick: "scroll", medium: "scroll" }
function questRow(t, { showProgress = false } = {}) {
  const owedBy = [...new Set([...(t.owed_to || []), ...t.people.filter((p) => p.ask_count > 0 && !p.resolved).map((p) => p.name)])]
  const icon = t.overdue ? "skull" : owedBy.length ? "bang" : ICON[t.effort] || "scroll"
  return `<div class="qrow ${t.status === "done" ? "done" : ""} ${state.selected === t.id ? "selected" : ""}" data-id="${t.id}">
    <span class="cursor">▶</span>${sprite(icon, { size: 3 })}
    <div class="qmain"><div class="qtitle">${esc(t.title)}</div>
      <div class="qmeta">${t.project ? `<span class="qtag" style="border-color:${projectColor(t.project)}">${esc(t.project)}</span>` : ""}${t.next_action ? `<span class="qtag">${ACTION_LABEL[t.next_action]}</span>` : ""}${t.due_date ? `<span class="qtag ${t.overdue ? "bad" : t.due_date === todayStr() ? "warn" : ""}">${t.overdue ? "OVERDUE" : t.due_date === todayStr() ? "DUE TODAY" : "due " + niceDate(t.due_date)}</span>` : ""}${owedBy.length ? `<span class="qtag bad">${esc(owedBy.join(", "))} waiting</span>` : ""}${t.is_blocked ? `<span class="qtag">blocked: ${esc([...t.blocked_by.people, ...t.blocked_by.tasks.map((x) => "#" + x.id)].join(", "))}</span>` : ""}${t.handoff_stale && t.status === "in_progress" ? `<span class="qtag">handoff stale</span>` : ""}</div>
      ${showProgress ? bar(t.progress) : ""}</div>
    <div class="qright"><span class="xp">★ ${xpFor(t)} XP</span>${t.status !== "done" ? `<button class="pxbtn sm" data-complete="${t.id}">CLEAR</button>` : `<span class="cleared">CLEARED</span>`}</div></div>`
}
const questList = (tasks, empty, opts) => tasks.length ? `<div class="qlist">${tasks.map((t) => questRow(t, opts)).join("")}</div>` : `<div class="qempty">${empty}</div>`
async function heroBar() {
  const h = await api("/hero")
  const hog = h.mood === "asleep" ? "hogSleep" : h.mood === "happy" ? "hogHappy" : "hog"
  const line = { worried: "Someone's asked twice…", tired: "Something's overdue.", asleep: "Zzz… nothing to do!", happy: "Cleared one today!", idle: "Ready when you are." }[h.mood]
  $("#hero-bar").innerHTML = `<div class="hero ${h.mood}">${sprite(hog, { size: 3, cls: "hog" })}<div class="hero-stats">
    <div class="hero-name">BRIAN <span>Lv ${h.level}</span></div>
    ${bar(h.level_progress, "xp")}<div class="hero-line">${h.xp} XP · ${h.xp_to_next} to next${h.streak ? ` · 🔥 ${h.streak}d` : ""}</div>
    <div class="hero-say">${line}</div></div></div>`
}
const questViews = {
  async focus() {
    const b = await api("/briefing"), all = await api("/tasks")
    const byId = Object.fromEntries(all.map((t) => [t.id, t])), full = (l) => l.map((x) => byId[x.id]).filter(Boolean)
    const shown = new Set()
    const take = (l) => { const r = full(l).filter((t) => !shown.has(t.id)); r.forEach((t) => shown.add(t.id)); return r }
    const owe = take(b.you_owe)
    const villagers = {}
    for (const t of owe) for (const n of [...new Set([...(t.owed_to || []), ...t.people.filter((p) => p.ask_count > 0 && !p.resolved).map((p) => p.name)])]) (villagers[n] ??= { tasks: [], asks: 0 }).tasks.push(t), villagers[n].asks = Math.max(villagers[n].asks, ...t.people.filter((p) => p.name === n).map((p) => p.ask_count))
    const vill = Object.entries(villagers).sort((a, b) => b[1].asks - a[1].asks).map(([n, v]) => `<div class="villager" data-id="${v.tasks[0].id}">
        <div class="bubble ${v.asks >= 2 ? "urgent" : ""}">${v.asks >= 2 ? "!!" : "!"}</div>${npc(n, 4)}<div class="vname">${esc(n)}</div><div class="vwant">${esc(v.tasks[0].title.slice(0, 34))}${v.tasks.length > 1 ? ` +${v.tasks.length - 1}` : ""}</div></div>`).join("")
    const unnamed = owe.filter((t) => !Object.values(villagers).some((v) => v.tasks.includes(t)))
    return `<h2 class="qh">Town square <span class="qsub">${new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</span></h2>
      ${b.inbox_new ? `<div class="notice" data-goto="inbox">${sprite("scroll", { size: 3 })} ${b.inbox_new} new notice${b.inbox_new > 1 ? "s" : ""} on the quest board</div>` : ""}
      ${Object.keys(villagers).length ? jw("Villagers waiting on you", `<div class="village">${vill}</div>`) : ""}
      ${unnamed.length ? jw("Replies you owe", questList(unnamed)) : ""}
      ${take(b.overdue).length ? jw("Overdue quests", questList(full(b.overdue)), "danger") : ""}
      ${jw("Due today", questList(take(b.due_today), "Nothing due today."))}
      ${jw("Next up", questList(take(b.top_focus), "Add a quest and it'll show up here."))}
      ${take(b.quick_wins).length ? jw("Side quests nearby", questList(full(b.quick_wins))) : ""}`
  },
  async deep() {
    const tasks = await api("/chip-away")
    return `<h2 class="qh">Main quests <span class="qsub">long journeys · least-recently-touched first</span></h2>
      ${tasks.length ? tasks.map((t) => `<section class="jw quest-card" data-id="${t.id}"><div class="jw-title">${sprite("sword", { size: 3 })} ${esc(t.title)} <span class="xp">★ ${xpFor(t)} XP</span></div><div class="jw-body">
        <div class="qmeta">${t.project ? `<span class="qtag" style="border-color:${projectColor(t.project)}">${esc(t.project)}</span>` : ""}${t.due_date ? `<span class="qtag ${t.overdue ? "bad" : ""}">${t.overdue ? "OVERDUE" : "due " + niceDate(t.due_date)}</span>` : ""}${(t.skills || []).map((k) => `<span class="qtag">${esc(k)}</span>`).join("")}${t.is_blocked ? `<span class="qtag bad">blocked</span>` : ""}</div>
        ${bar(t.progress)}
        <div class="qactions"><button class="pxbtn sm" data-prog="${t.id}" data-delta="-10">−10</button><button class="pxbtn sm" data-prog="${t.id}" data-delta="10">+10</button><button class="pxbtn sm" data-id="${t.id}" data-open>Continue ▶</button><button class="pxbtn sm" data-complete="${t.id}">CLEAR</button></div>
        <div class="qlast">last touched ${new Date(t.updated_at).toLocaleDateString()}${t.handoff ? " · handoff ready" : " · no handoff yet"}</div></div></section>`).join("") : `<div class="qempty">No main quests. Mark a big task as Deep effort and it becomes one.</div>`}`
  },
  async quick() {
    const tasks = await api("/quick-wins")
    return `<h2 class="qh">Side quests <span class="qsub">${tasks.length} short ones · under ~20 min</span></h2>${jw("", questList(tasks, "No side quests. Mark small tasks as Quick."))}`
  },
  async owed() {
    const tasks = await api("/owed")
    const byPerson = {}
    for (const t of tasks) for (const n of [...new Set([...t.owed_to, ...t.people.filter((p) => p.ask_count > 0 && !p.resolved).map((p) => p.name)])]) (byPerson[n] ??= []).push(t)
    const unnamed = tasks.filter((t) => !t.owed_to.length && !t.people.some((p) => p.ask_count > 0 && !p.resolved))
    return `<h2 class="qh">Villagers waiting on you <span class="qsub">${tasks.length}</span></h2>
      ${Object.entries(byPerson).sort((a, b) => b[1].length - a[1].length).map(([n, l]) => jw(`${npc(n, 2)} ${esc(n)} · ${l.length}`, questList(l))).join("")}
      ${unnamed.length ? jw("Replies you owe (nobody named)", questList(unnamed)) : ""}
      ${!tasks.length ? `<div class="qempty">Nobody's waiting. The village is at peace.</div>` : ""}`
  },
  async inbox() {
    const raw = await api("/inbox?status=" + (state.inboxStatus || "new"))
    const { items, controls } = inboxPrep(raw)
    const all = await api("/tasks?include_done=true")
    const tasks = Object.fromEntries(all.map((t) => [t.id, t.title])), doneIds = new Set(all.filter((t) => t.status === "done").map((t) => t.id))
    const sug = (x) => x ? Object.entries(x).filter(([k]) => !["links", "priority", "impact", "effort", "next_action", "project", "due_date", "reopen"].includes(k)).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`).join(" · ") : ""
    return `<h2 class="qh">Quest board <span class="qsub">notices from the morning sweep</span></h2>
      ${controls.replace(/<select /g, '<select class="pxsel" ')}
      <div class="filters"><select data-inbox-status class="pxsel"><option value="new" ${(state.inboxStatus || "new") === "new" ? "selected" : ""}>Posted</option><option value="accepted" ${state.inboxStatus === "accepted" ? "selected" : ""}>Taken</option><option value="dismissed" ${state.inboxStatus === "dismissed" ? "selected" : ""}>Torn down</option></select></div>
      <div class="board">${items.length ? items.map((it) => `<div class="notice-card kind-${it.kind}"><div class="pin"></div>
        <div class="nk">${INBOX_LABEL[it.kind]}</div><div class="nt">${esc(it.title)}</div>
        ${suggestionBadges(it.suggested, "qtag")}
        ${it.body ? `<div class="nb">${esc(it.body)}</div>` : ""}
        ${it.task_id ? `<a href="#" data-id="${it.task_id}" class="nlink">↗ adds to quest #${it.task_id} ${esc(tasks[it.task_id] || "")}</a>` : ""}
        ${it.url ? `<a href="${esc(it.url)}" target="_blank" class="nlink">${esc(it.url.replace(/^https?:\/\//, "").slice(0, 48))}</a>` : ""}
        ${sug(it.suggested) ? `<div class="ns">${esc(sug(it.suggested))}</div>` : ""}
        <div class="nby">${esc(it.added_by)} · ${new Date(it.created_at).toLocaleDateString()}</div>
        ${it.status === "new" ? `<div class="qactions"><button class="pxbtn sm" data-accept="${it.id}">${it.task_id ? "Add to quest" : "Take quest"}</button><button class="pxbtn sm ghost" data-dismiss="${it.id}">Tear down</button></div>` : ""}</div>`).join("") : `<div class="qempty">The board is empty. Your sweep will pin notices here.</div>`}</div>`
  },
  async people() {
    const people = await api("/people")
    if (!people.length) return `<h2 class="qh">Party</h2><div class="qempty">No one yet. Add people to a quest.</div>`
    const cards = await Promise.all(people.map(async (p) => {
      const tasks = await api(`/tasks?person=${encodeURIComponent(p.name)}`)
      const role = p.owed_count ? `wants ${p.owed_count} from you` : p.waiting_on_count ? `you await ${p.waiting_on_count}` : p.collaborating_count ? `ally on ${p.collaborating_count}` : "no open quests"
      return `<section class="jw party-card"><div class="jw-body"><div class="party-head">${npc(p.name, 4)}<div><div class="pname">${esc(p.name)}</div><div class="prole ${p.owed_count ? "bad" : ""}">${role}</div>${p.contact ? `<div class="qsub">${esc(p.contact)}</div>` : ""}</div></div>${questList(tasks, "")}</div></section>`
    }))
    return `<h2 class="qh">Party</h2><div class="party-grid">${cards.join("")}</div>`
  },
  async map() {
    const all = await api("/tasks?include_done=true")
    const byP = {}
    for (const t of all) (byP[t.project || "Wilderness"] ??= []).push(t)
    const regions = Object.entries(byP).map(([name, l]) => {
      const open = l.filter((t) => t.status !== "done"), done = l.length - open.length
      const pct = l.length ? (done / l.length) * 100 : 0
      return `<div class="region ${open.length ? "" : "cleared"}" data-project="${esc(name)}"><div class="rflag">${sprite(open.length ? "map" : "flag", { size: 4 })}</div><div class="rname">${esc(name)}</div><div class="rcount">${open.length} open · ${done} cleared</div>${bar(pct)}</div>`
    }).join("")
    return `<h2 class="qh">World map <span class="qsub">${Object.keys(byP).length} regions</span></h2><div class="world">${regions}</div>`
  },
  async victory() {
    const done = (await api("/tasks?status=done")).sort((a, b) => (b.completed_at || "").localeCompare(a.completed_at || ""))
    const h = await api("/hero")
    const weekKey = (iso) => { const d = new Date(iso); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return ymd(d) }
    const groups = {}
    for (const t of done) (groups[t.completed_at ? weekKey(t.completed_at) : "earlier"] ??= []).push(t)
    const label = (k) => k === "earlier" ? "Earlier" : k === weekKey(new Date().toISOString()) ? "This week" : `Week of ${niceDate(k)}`
    return `<h2 class="qh">Trophy room <span class="qsub">${h.total_cleared} quests cleared · ${h.xp} XP · Lv ${h.level}</span></h2>
      ${Object.entries(groups).map(([k, l]) => jw(`${label(k)} · ${l.length}`, `<div class="shelf">${l.map((t) => `<div class="trophy" data-id="${t.id}" title="${esc(t.title)}">${sprite(t.impact >= 4 ? "trophy" : t.impact >= 3 ? "star" : "heart", { size: 4 })}<div class="tname">${esc(t.title.slice(0, 22))}${t.title.length > 22 ? "…" : ""}</div><div class="txp">+${xpFor(t)}</div></div>`).join("")}</div>`)).join("") || `<div class="qempty">No trophies yet. Clear a side quest.</div>`}`
  },
}

async function render() {
  const view = $("#view")
  const q = $("#search").value.trim()
  const quest = state.mode === "quest"
  const fn = quest && questViews[state.view] ? questViews[state.view] : views[state.view] || views.focus
  try { view.innerHTML = q ? await views.search(q) : await fn() } catch (e) { view.innerHTML = `<div class="empty">${esc(e.message)}</div>` }
  if (quest) heroBar().catch(() => {})
  document.querySelectorAll("#sidebar nav button[data-q]").forEach((b) => { if (!b.dataset.list) b.dataset.list = b.childNodes[0].textContent.trim(); b.childNodes[0].textContent = (quest ? b.dataset.q : b.dataset.list) + " " })
  document.querySelectorAll("#sidebar nav button").forEach((b) => b.classList.toggle("active", b.dataset.view === state.view && !state.project))
  const projects = await api("/projects")
  api("/inbox").then((items) => { $("#inbox-badge").textContent = items.length || "" })
  $("#project-list").innerHTML = projects.map((p) => `<button data-project="${esc(p)}" class="${state.project === p ? "active" : ""}">${esc(p)}</button>`).join("")
  $("#projects-dl").innerHTML = projects.map((p) => `<option value="${esc(p)}">`).join("")
  if (state.selected) renderDetail().catch(() => closeDetail())
}

// Tiny markdown: headings, bold, bullets, links. Enough for context notes without a library.
function md(src) {
  return esc(src)
    .replace(/^### (.*)$/gm, "<h3>$1</h3>").replace(/^## (.*)$/gm, "<h2>$1</h2>").replace(/^# (.*)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/^[-*] (.*)$/gm, "• $1")
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank">$1</a>')
}
function handoffBlock({ handoff, updated_at, updated_by, stale }, saveUrl, key) {
  const editing = state.editingHandoff === key
  return `<div class="handoff">
    <div class="hd"><strong>🤝 LLM handoff</strong>${stale ? `<span class="pill stale">stale</span>` : ""}<span>${updated_at ? `updated ${new Date(updated_at).toLocaleString()} by ${esc(updated_by || "me")}` : "not written yet"}</span>
      <span style="margin-left:auto"></span>${editing ? `<button class="primary sm" data-handoff-save="${key}" data-url="${saveUrl}">Save</button><button class="ghost sm" data-handoff-cancel>Cancel</button>` : `<button class="ghost sm" data-handoff-edit="${key}">${handoff ? "Edit" : "Write"}</button>${handoff ? `<button class="ghost sm" data-copy="${key}" title="Copy as markdown">Copy</button>` : ""}`}</div>
    ${editing ? `<textarea id="handoff-${key}" data-handoff-text="${key}">${esc(handoff || "")}</textarea>${!handoff ? `<div style="margin-top:4px"><button class="ghost sm" data-handoff-template="${key}">Insert template</button></div>` : ""}`
      : handoff ? `<div class="context-md" id="handoff-${key}">${md(handoff)}</div>` : `<div class="muted" style="font-size:13px">The quick-reference an assistant reads first. Ask Claude or ChatGPT to write it, or click Write.</div>`}
  </div>`
}
function groupedLinks(links) {
  if (!links.length) return "<div class='muted' style='font-size:13px'>None yet. Paste a Claude or ChatGPT chat, Slack thread, PR, email, RFC, doc, or Figma file.</div>"
  const groups = {}
  for (const l of links) (groups[LINK_GROUP[l.kind] || "Other"] ??= []).push(l)
  return Object.entries(groups).map(([g, ls]) => `<div class="link-group">${g}</div><ul>${ls.map((l) => `<li class="link-row"><span class="pill kind">${KIND_LABEL[l.kind] || l.kind}</span><span class="grow"><a href="${esc(l.url)}" target="_blank" title="${esc(l.url)}">${esc(l.title || l.url.replace(/^https?:\/\//, ""))}</a></span><span class="muted" style="font-size:11px">${esc(l.added_by)}</span><button class="x" data-del-link="${l.id}">✕</button></li>`).join("")}</ul>`).join("")
}

// Build a self-contained prompt from a task so Claude or ChatGPT can pick it up cold.
function taskPrompt(t) {
  const people = t.people.map((p) => `${p.name} (${p.role === "owed_to" ? "waiting on me" : p.role === "waiting_on" ? "I'm waiting on them" : "collaborator"}${p.note ? ": " + p.note : ""}${p.ask_count ? `, asked ${p.ask_count}×` : ""}${p.resolved ? ", resolved" : ""})`)
  const lines = [
    `Help me with task #${t.id} in my Tasks app: "${t.title}".`,
    `Use the Tasks connector: call get_task(${t.id}) for the live record, add_link this conversation to it, add_note progress, and update_handoff(${t.id}) before we stop. If we finish it, call complete_task(${t.id}, closing_notes) with why/how it closed. Load skills first if listed.`,
    "",
    `Priority P${t.priority} · Impact ${t.impact} · Effort ${t.effort}${t.next_action ? ` · Next action: ${ACTION_LABEL[t.next_action]}` : ""}${t.due_date ? ` · Due ${t.due_date}` : ""}${t.project ? ` · Project: ${t.project}` : ""}`,
    t.skills.length ? `Skills: ${t.skills.join(", ")}` : "", t.channels.length ? `Channels: ${t.channels.join(", ")}` : "",
    people.length ? `People: ${people.join("; ")}` : "",
    t.description ? `\n## Description\n${t.description}` : "",
    t.handoff ? `\n## Handoff (quick reference)${t.handoff_stale ? " — may be stale, verify against notes" : ""}\n${t.handoff}` : "",
    t.context ? `\n## Context\n${t.context}` : "",
    t.links.length ? `\n## Sources\n${t.links.map((l) => `- ${l.title ? l.title + ": " : ""}${l.url}`).join("\n")}` : "",
    t.notes.length ? `\n## Notes so far\n${t.notes.slice(-6).map((n) => `- [${n.added_by}, ${n.created_at.slice(0, 10)}] ${n.title ? n.title + ": " : ""}${n.body}`).join("\n")}` : "",
    "", "Start by telling me, in three lines, what you think the next concrete step is.",
  ]
  return lines.filter((l) => l !== "").join("\n")
}

// ---------- detail panel ----------
async function renderDetail() {
  const t = await api("/tasks/" + state.selected)
  const d = $("#detail")
  d.classList.remove("hidden")
  d.innerHTML = `
    <button class="ghost sm" id="detail-close" style="float:right">✕</button>
    <h2>${esc(t.title)}</h2><div class="meta" style="display:flex;flex-wrap:wrap;gap:6px">${pills({ ...t, link_counts: {} })}</div>
    <div class="toolbar">
      ${t.status !== "done" ? `<button class="primary sm" data-complete="${t.id}">Mark done</button>` : `<button class="ghost sm" data-reopen="${t.id}">Reopen</button>`}
      <select class="sm" id="detail-status">${Object.entries(STATUS_LABEL).map(([k, v]) => `<option value="${k}" ${t.status === k ? "selected" : ""}>${v}</option>`).join("")}</select>
      <button class="ghost sm" id="detail-edit">Edit</button><button class="ghost sm danger" id="detail-delete">Delete</button>
    </div>
    ${t.status !== "done" ? `<div class="toolbar" title="Quick = side quest / quick win, Deep = main quest / chip away">${["quick", "medium", "deep"].map((ef) => `<button class="${t.effort === ef ? "primary" : "ghost"} sm" data-effort="${ef}" data-task="${t.id}" ${t.effort === ef ? "disabled" : ""}>${EFFORT_LABEL[ef]}</button>`).join("")}</div>` : ""}
    <div class="toolbar open-in"><button class="ghost sm" data-copy-prompt title="Copies a full brief: context, people, links, notes, and instructions for the assistant to update this task">📋 Copy task prompt for Claude / ChatGPT</button></div>
    ${t.description ? `<div class="desc">${esc(t.description)}</div>` : ""}
    <dl class="kv">
      ${t.channels.length ? `<dt>Watching</dt><dd>${t.channels.map((c) => `<span class="pill channel">${esc(c)}</span>`).join(" ")}</dd>` : ""}
      ${t.skills.length ? `<dt>Skills</dt><dd>${t.skills.map((c) => `<span class="pill skill">${esc(c)}</span>`).join(" ")}</dd>` : ""}
      ${t.tags ? `<dt>Tags</dt><dd>${esc(t.tags)}</dd>` : ""}
      <dt>Added by</dt><dd>${esc(t.added_by)} · ${new Date(t.created_at).toLocaleDateString()}</dd>
      ${t.completed_at ? `<dt>Done</dt><dd>${new Date(t.completed_at).toLocaleString()}</dd>` : ""}
    </dl>

    ${handoffBlock({ handoff: t.handoff, updated_at: t.handoff_updated_at, updated_by: t.handoff_updated_by, stale: t.handoff_stale }, `/tasks/${t.id}/handoff`, "t" + t.id)}

    ${t.effort === "deep" && t.status !== "done" ? `<h3>Quest progress</h3>${bar(t.progress)}<div class="qactions" style="margin-top:4px"><button class="ghost sm" data-prog="${t.id}" data-delta="-10">−10</button><button class="ghost sm" data-prog="${t.id}" data-delta="10">+10</button><button class="ghost sm" data-prog="${t.id}" data-delta="25">+25</button></div>` : ""}

    <h3>Context</h3>
    ${t.context ? `<div class="context-md">${md(t.context)}</div>` : `<div class="muted" style="font-size:13px">No background yet. Edit the task to add it, or ask Claude/ChatGPT to fill it in.</div>`}
    <div class="add-row"><textarea id="ctx-append" rows="2" placeholder="Append to context…"></textarea><button class="ghost sm" id="ctx-add">Add</button></div>

    <h3>Links</h3>
    ${groupedLinks(t.links)}
    <ul style="display:none">${t.links.map((l) => `<li class="link-row"><span class="pill kind">${KIND_LABEL[l.kind] || l.kind}</span><span class="grow"><a href="${esc(l.url)}" target="_blank" title="${esc(l.url)}">${esc(l.title || l.url.replace(/^https?:\/\//, ""))}</a></span><span class="muted" style="font-size:11px">${esc(l.added_by)}</span><button class="x" data-del-link="${l.id}">✕</button></li>`).join("") || "<li class='muted'>None yet. Paste a Claude or ChatGPT chat, Slack message, or GitHub PR.</li>"}</ul>
    <div class="add-row"><input id="link-url" placeholder="https://…" /><input id="link-title" placeholder="label" style="flex:0 0 110px" /><button class="ghost sm" id="link-add">Add</button></div>

    <h3>People</h3>
    <ul>${t.people.map((p) => `<li class="person ${p.resolved ? "resolved" : ""}"><span class="pill ${p.role === "waiting_on" ? "blocked" : p.role === "owed_to" ? "owed" : ""}">${p.role === "waiting_on" ? "waiting on" : p.role === "owed_to" ? "I owe" : "with"}</span><span class="grow"><strong>${esc(p.name)}</strong>${p.note ? ` · ${esc(p.note)}` : ""}</span>
      ${p.ask_count ? `<span class="pill ${p.ask_count >= 2 ? "asked" : ""}" title="Times they've pinged you">asked ${p.ask_count}×</span>` : ""}
      <button class="ghost sm" data-asked="${esc(p.name)}" data-role="${p.role}" title="They pinged me again">+1 ask</button>
      ${p.role !== "collaborator" ? `<button class="ghost sm" data-resolve="${esc(p.name)}" data-role="${p.role}" data-resolved="${p.resolved ? 0 : 1}">${p.resolved ? "Unresolve" : p.role === "owed_to" ? "Delivered" : "Got it"}</button>` : ""}<button class="x" data-del-person="${esc(p.name)}" data-role="${p.role}">✕</button></li>`).join("") || "<li class='muted'>No one attached.</li>"}</ul>
    <div class="add-row"><input id="person-name" placeholder="Name" /><select id="person-role"><option value="waiting_on">Waiting on them</option><option value="owed_to">I owe them</option><option value="collaborator">Collaborator</option></select><input id="person-note" placeholder="for what?" /><button class="ghost sm" id="person-add">Add</button></div>

    <h3>Depends on</h3>
    <ul>${t.depends_on.map((x) => `<li><span class="grow"><a href="#" data-id="${x.id}">#${x.id} ${esc(x.title)}</a> <span class="pill status">${STATUS_LABEL[x.status]}</span></span><button class="x" data-del-dep="${x.id}">✕</button></li>`).join("") || "<li class='muted'>No task dependencies.</li>"}</ul>
    <div class="add-row"><input id="dep-id" type="number" placeholder="Task #" style="flex:0 0 90px" /><button class="ghost sm" id="dep-add">Add dependency</button></div>

    <h3>Notes</h3>
    <ul>${t.notes.map((n) => `<li><div class="note grow">${n.title ? `<strong>${esc(n.title)}</strong>` : ""}<div class="body">${esc(n.body)}</div><div class="by">${esc(n.added_by)} · ${new Date(n.updated_at).toLocaleString()}</div></div><button class="x" data-del-note="${n.id}">✕</button></li>`).join("") || "<li class='muted'>No notes.</li>"}</ul>
    <div class="add-row"><textarea id="tnote-body" rows="2" placeholder="Add a note…"></textarea><button class="ghost sm" id="tnote-add">Add</button></div>`

  $("#detail-close").onclick = closeDetail
  $("#detail-status").onchange = async (e) => { await api("/tasks/" + t.id, { method: "PATCH", body: { status: e.target.value } }); render() }
  $("#detail-edit").onclick = () => openTaskForm(t)
  d.querySelector("[data-copy-prompt]").onclick = async () => { await navigator.clipboard.writeText(taskPrompt(t)); toast("Task prompt copied. Paste it into a chat with the Tasks connector on.") }
  $("#detail-delete").onclick = async () => { if (confirm(`Delete "${t.title}"?`)) { await api("/tasks/" + t.id, { method: "DELETE" }); closeDetail(); render() } }
  $("#ctx-add").onclick = async () => { const v = $("#ctx-append").value.trim(); if (!v) return; await api("/tasks/" + t.id, { method: "PATCH", body: { append_context: v } }); render() }
  d.querySelectorAll("[data-asked]").forEach((b) => b.onclick = async () => { await api(`/tasks/${t.id}/people`, { method: "POST", body: { name: b.dataset.asked, role: b.dataset.role, asked: true } }); render() })
  $("#link-add").onclick = async () => { const url = $("#link-url").value.trim(); if (!url) return; await api(`/tasks/${t.id}/links`, { method: "POST", body: { url, title: $("#link-title").value.trim() } }); render() }
  $("#person-add").onclick = async () => { const name = $("#person-name").value.trim(); if (!name) return; await api(`/tasks/${t.id}/people`, { method: "POST", body: { name, role: $("#person-role").value, note: $("#person-note").value.trim() } }); render() }
  $("#dep-add").onclick = async () => { const dep = Number($("#dep-id").value); if (!dep) return; await api(`/tasks/${t.id}/deps`, { method: "POST", body: { depends_on_id: dep } }); render() }
  $("#tnote-add").onclick = async () => { const body = $("#tnote-body").value.trim(); if (!body) return; await api("/notes", { method: "POST", body: { task_id: t.id, body } }); render() }
  d.querySelectorAll("[data-del-link]").forEach((b) => b.onclick = async () => { await api("/links/" + b.dataset.delLink, { method: "DELETE" }); render() })
  d.querySelectorAll("[data-del-person]").forEach((b) => b.onclick = async () => { await api(`/tasks/${t.id}/people`, { method: "DELETE", body: { name: b.dataset.delPerson, role: b.dataset.role } }); render() })
  d.querySelectorAll("[data-resolve]").forEach((b) => b.onclick = async () => { await api(`/tasks/${t.id}/people`, { method: "POST", body: { name: b.dataset.resolve, role: b.dataset.role, resolved: b.dataset.resolved === "1", note: t.people.find((p) => p.name === b.dataset.resolve && p.role === b.dataset.role)?.note } }); render() })
  d.querySelectorAll("[data-del-dep]").forEach((b) => b.onclick = async () => { await api(`/tasks/${t.id}/deps/${b.dataset.delDep}`, { method: "DELETE" }); render() })
  d.querySelectorAll("[data-del-note]").forEach((b) => b.onclick = async () => { await api("/notes/" + b.dataset.delNote, { method: "DELETE" }); render() })
  d.querySelectorAll("[data-reopen]").forEach((b) => b.onclick = async () => { await api("/tasks/" + t.id, { method: "PATCH", body: { status: "todo" } }); render() })
}
function closeDetail() { state.selected = null; $("#detail").classList.add("hidden"); document.querySelectorAll(".task.selected").forEach((e) => e.classList.remove("selected")) }

// ---------- task form ----------
function openTaskForm(t = null, defaults = {}) {
  const f = $("#task-form")
  f.reset()
  f.dataset.id = t?.id || ""
  $("#task-form-title").textContent = t ? "Edit task" : "New task"
  const v = { ...defaults, ...(t || {}) }
  for (const k of ["title", "description", "priority", "impact", "status", "due_date", "project", "tags", "effort", "next_action", "context"]) if (v[k] != null) f.elements[k].value = v[k]
  f.elements.channels.value = (v.channels || []).join(", ")
  f.elements.skills.value = (v.skills || []).join(", ")
  f.elements.freq.value = v.recurrence?.freq || ""
  f.elements.interval.value = v.recurrence?.interval || 1
  f.querySelectorAll("input[name=wd]").forEach((c) => c.checked = !!v.recurrence?.weekdays?.includes(Number(c.value)))
  f.elements.waiting_on.value = (t?.people || []).filter((p) => p.role === "waiting_on" && !p.resolved).map((p) => p.name).join(", ")
  f.elements.collaborators.value = (t?.people || []).filter((p) => p.role === "collaborator").map((p) => p.name).join(", ")
  f.elements.owed_to.value = (t?.people || []).filter((p) => p.role === "owed_to" && !p.resolved).map((p) => p.name).join(", ")
  f.elements.waiting_on.closest("label").parentElement.classList.toggle("hidden", !!t) // people are edited in the detail panel for existing tasks
  $("#task-dialog").showModal()
}
$("#task-cancel").onclick = () => $("#task-dialog").close()
$("#task-form").onsubmit = async (e) => {
  e.preventDefault()
  const f = e.target, fd = new FormData(f)
  const split = (s) => s.split(",").map((x) => x.trim()).filter(Boolean)
  const body = {
    title: fd.get("title"), description: fd.get("description"), priority: Number(fd.get("priority")), impact: Number(fd.get("impact")),
    status: fd.get("status"), due_date: fd.get("due_date") || null, project: fd.get("project").trim(), tags: split(fd.get("tags")),
    effort: fd.get("effort"), next_action: fd.get("next_action") || null, context: fd.get("context"), channels: split(fd.get("channels")), skills: split(fd.get("skills")),
    recurrence: fd.get("freq") ? { freq: fd.get("freq"), interval: Number(fd.get("interval")) || 1, weekdays: fd.getAll("wd").map(Number) } : null,
  }
  if (f.dataset.id) await api("/tasks/" + f.dataset.id, { method: "PATCH", body })
  else { const t = await api("/tasks", { method: "POST", body: { ...body, waiting_on: split(fd.get("waiting_on")), collaborators: split(fd.get("collaborators")), owed_to: split(fd.get("owed_to")) } }); state.selected = t.id }
  $("#task-dialog").close(); render()
}

// ---------- closing notes ----------
async function askClosingNotes(id, rowEl) {
  const t = await api("/tasks/" + id)
  const dlg = $("#close-dialog"), form = $("#close-form")
  form.reset(); $("#close-title").textContent = t.title
  dlg.showModal()
  const finish = async (notes) => {
    dlg.close(); rowEl?.classList.add("just-done")
    const r = await api(`/tasks/${id}/complete`, { method: "POST", body: { closing_notes: notes } })
    celebrate(r.task.title)
    if (r.next) setTimeout(() => toast(`↻ Next one is due ${niceDate(r.next.due_date)}.`), 3300)
    render()
  }
  form.onsubmit = (e) => { e.preventDefault(); finish(new FormData(form).get("closing_notes")) }
  $("#close-skip").onclick = () => finish("")
  setTimeout(() => form.elements.closing_notes.focus(), 50)
}

// ---------- settings ----------
$("#settings-btn").onclick = async () => {
  const m = await api("/meta")
  const stdio = { mcpServers: { "task-tracker": { command: "node", args: [`${m.project_dir}/src/mcp-stdio.js`] } } }
  $("#s-datadir").textContent = m.data_dir
  $("#s-stdio").textContent = JSON.stringify(stdio, null, 2)
  $("#s-claude-cmd").textContent = `claude mcp add --scope user task-tracker -- node "${m.project_dir}/src/mcp-stdio.js"`
  $("#s-tunnel").textContent = `cloudflared tunnel --url http://localhost:${m.port}`
  $("#s-mcp-path").textContent = `/mcp/${m.token}`
  api("/backups").then((b) => { $("#s-backupdir").textContent = b.dir; $("#s-backups").textContent = b.backups.length ? `Latest: ${b.backups[0].file} (${Math.round(b.backups[0].bytes / 1024)} KB), ${b.backups.length} on disk.` : "None yet." })
  $("#settings-dialog").showModal()
}
const applyMode = (m) => { state.mode = m; document.documentElement.dataset.mode = m; $("#mode-btn").textContent = m === "quest" ? "📋 List mode" : "🗡 Quest mode"; try { localStorage.setItem("mode", m) } catch {} }
try { applyMode(localStorage.getItem("mode") || "quest") } catch { applyMode("quest") }
$("#mode-btn").onclick = () => { applyMode(state.mode === "quest" ? "list" : "quest"); if (state.view === "map" && state.mode !== "quest") state.view = "focus"; render() }
const applyTheme = (t) => { document.documentElement.dataset.theme = t; $("#theme-btn").textContent = t === "crt" ? "🖥 Platinum mode" : "🖥 Night mode"; try { localStorage.setItem("theme", t) } catch {} }
try { applyTheme(localStorage.getItem("theme") || "platinum") } catch { applyTheme("platinum") }
$("#theme-btn").onclick = () => applyTheme(document.documentElement.dataset.theme === "crt" ? "platinum" : "crt")
$("#settings-close").onclick = () => $("#settings-dialog").close()

// ---------- global events ----------
$("#new-task").onclick = () => openTaskForm(null, state.project ? { project: state.project } : {})
$("#search").oninput = () => render()
document.addEventListener("keydown", (e) => { if (e.key === "n" && !e.metaKey && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName) && !document.querySelector("dialog[open]")) { e.preventDefault(); $("#new-task").click() } if (e.key === "Escape" && !document.querySelector("dialog[open]")) closeDetail() })
document.addEventListener("click", async (e) => {
  const nav = e.target.closest("#sidebar nav button"); if (nav) { state.view = nav.dataset.view; state.project = null; $("#search").value = ""; return render() }
  const rg = e.target.closest(".region[data-project]"); if (rg) { state.project = rg.dataset.project === "Wilderness" ? "" : rg.dataset.project; state.view = "list"; return render() }
  const pr = e.target.closest("[data-project]"); if (pr) { state.project = state.project === pr.dataset.project ? null : pr.dataset.project; state.view = state.project ? "project" : "list"; $("#search").value = ""; return render() }
  const done = e.target.closest("[data-complete]"); if (done) { e.stopPropagation(); return askClosingNotes(Number(done.dataset.complete), done.closest(".task, .qrow")) }
  const cal = e.target.closest("[data-cal]"); if (cal && cal.tagName === "BUTTON") {
    const m = state.calMonth, step = state.calMode === "week" ? 7 : 0
    if (cal.dataset.cal === "today") state.calMonth = new Date()
    else if (state.calMode === "week") m.setDate(m.getDate() + (cal.dataset.cal === "next" ? step : -step))
    else m.setMonth(m.getMonth() + (cal.dataset.cal === "next" ? 1 : -1))
    return render()
  }
  const f = e.target.closest("[data-f]"); if (f && f.type === "checkbox") { state.filters.include_done = f.checked; return render() }
  const he = e.target.closest("[data-handoff-edit]"); if (he) { state.editingHandoff = he.dataset.handoffEdit; return render() }
  const hc = e.target.closest("[data-handoff-cancel]"); if (hc) { state.editingHandoff = null; return render() }
  const ht = e.target.closest("[data-handoff-template]"); if (ht) { const { template } = await api("/handoff-template"); const ta = document.getElementById("handoff-" + ht.dataset.handoffTemplate); if (ta) ta.value = template; return }
  const hs = e.target.closest("[data-handoff-save]"); if (hs) { const ta = document.getElementById("handoff-" + hs.dataset.handoffSave); await api(hs.dataset.url, { method: "PUT", body: { handoff: ta.value, updated_by: "me" } }); state.editingHandoff = null; toast("Handoff saved"); return render() }
  const cp = e.target.closest("[data-copy]"); if (cp) { const el = document.getElementById("handoff-" + cp.dataset.copy); const raw = el?.dataset.raw ?? el?.innerText ?? ""; await navigator.clipboard.writeText(raw); toast("Copied"); return }
  const pg = e.target.closest("[data-prog]"); if (pg) { e.stopPropagation(); const t = await api("/tasks/" + pg.dataset.prog); await api("/tasks/" + pg.dataset.prog, { method: "PATCH", body: { progress: Math.max(0, Math.min(100, t.progress + Number(pg.dataset.delta))) } }); return render() }
  const ef = e.target.closest("[data-effort][data-task]"); if (ef) { e.stopPropagation(); await api("/tasks/" + ef.dataset.task, { method: "PATCH", body: { effort: ef.dataset.effort } }); toast(`Now ${EFFORT_LABEL[ef.dataset.effort]}`); return render() }
  const goto = e.target.closest("[data-goto]"); if (goto) { e.preventDefault(); state.view = goto.dataset.goto; state.project = null; return render() }
  const acc = e.target.closest("[data-accept]"); if (acc) { const r = await api(`/inbox/${acc.dataset.accept}/accept`, { method: "POST", body: {} }); if (r.task) { state.selected = r.task.id; toast(acc.textContent.startsWith("Add") ? `Added to #${r.task.id}` : `Created #${r.task.id}`) } return render() }
  const dis = e.target.closest("[data-dismiss]"); if (dis) { await api(`/inbox/${dis.dataset.dismiss}/dismiss`, { method: "POST" }); return render() }
  const noteAdd = e.target.closest("#note-add"); if (noteAdd) { const body = $("#note-body").value.trim(); if (!body) return; await api("/notes", { method: "POST", body: { title: $("#note-title").value.trim(), body } }); return render() }
  const delNote = e.target.closest("#view [data-del-note]"); if (delNote) { await api("/notes/" + delNote.dataset.delNote, { method: "DELETE" }); return render() }
  const row = e.target.closest("[data-id]"); if (row && !e.target.closest("#detail")) { e.preventDefault(); state.selected = Number(row.dataset.id); document.querySelectorAll(".task.selected").forEach((x) => x.classList.remove("selected")); row.classList.add("selected"); return renderDetail() }
})
document.addEventListener("input", (e) => { const vq = e.target.closest("[data-victory-q]"); if (vq) { state.victoryQuery = vq.value; clearTimeout(state.vqT); state.vqT = setTimeout(render, 250) } })
document.addEventListener("change", (e) => { const f = e.target.closest("[data-f]"); if (f && f.tagName === "SELECT") { state.filters[f.dataset.f] = f.value; render() } const vq = e.target.closest("[data-victory-q]"); if (vq) { state.victoryQuery = vq.value; render() } const cm = e.target.closest("[data-cal=mode]"); if (cm) { state.calMode = cm.value; render() } const is = e.target.closest("[data-inbox-status]"); if (is) { state.inboxStatus = is.value; render() } const inf = e.target.closest("[data-if]"); if (inf) { (state.inboxFilters ??= {})[inf.dataset.if] = inf.value; render() } })
document.addEventListener("dblclick", (e) => { const day = e.target.closest("[data-day]"); if (day && !e.target.closest(".ev")) openTaskForm(null, { due_date: day.dataset.day, project: state.project || "" }) })
document.addEventListener("click", (e) => { const a = e.target.closest("a[target=_blank]"); if (a && window.require) { e.preventDefault(); window.open(a.href) } })

function applyHash() {
  const h = new URLSearchParams(location.hash.slice(1))
  if (h.has("task")) { state.selected = Number(h.get("task")); state.view = "focus" }
  if (h.has("view")) { state.view = h.get("view"); state.project = null }
  if (h.has("new")) setTimeout(() => $("#new-task").click(), 50)
  if (location.hash) history.replaceState(null, "", location.pathname)
}
if ("Notification" in window && Notification.permission === "default") setTimeout(() => Notification.requestPermission(), 4000)
applyHash()
addEventListener("hashchange", () => { applyHash(); render() })
render()
setInterval(() => { if (!document.querySelector("dialog[open]") && !state.editingHandoff) render() }, 15000) // pick up changes made by Claude/ChatGPT
