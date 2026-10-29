// MCP tool definitions. Shared by the HTTP endpoint (ChatGPT, Claude via tunnel) and the stdio server (Claude Desktop / Claude Code).
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import * as s from "./store.js"

const text = (v) => ({ content: [{ type: "text", text: typeof v === "string" ? v : JSON.stringify(v, null, 2) }] })
const wrap = (fn) => async (args) => {
  try { return text(await fn(args)) } catch (e) { return { ...text(`Error: ${e.message}`), isError: true } }
}

const recurrence = z.object({
  freq: z.enum(["daily", "weekly", "monthly", "yearly"]),
  interval: z.number().int().min(1).optional().describe("Every N periods. Default 1."),
  weekdays: z.array(z.number().int().min(0).max(6)).optional().describe("Weekly only: days to repeat on, 0=Sunday … 6=Saturday"),
}).nullable()

const taskFields = {
  title: z.string(),
  description: z.string().optional(),
  status: z.enum(["todo", "in_progress", "blocked", "done"]).optional(),
  priority: z.number().int().min(1).max(4).optional().describe("1=urgent, 2=high, 3=normal (default), 4=low"),
  impact: z.number().int().min(1).max(5).optional().describe("How much it matters if done: 1=tiny … 5=huge. Default 3."),
  due_date: z.string().nullable().optional().describe("YYYY-MM-DD"),
  project: z.string().optional(),
  tags: z.array(z.string()).optional(),
  recurrence: recurrence.optional(),
  effort: z.enum(["quick", "medium", "deep"]).optional().describe("quick = under ~20 min (a quick win), medium, deep = multi-session work to chip away at. Default medium."),
  next_action: z.enum(["slack_reply", "email_reply", "creative_review", "write", "build", "decide", "meeting", "research", "wait"]).nullable().optional().describe("The single next physical step. Lets {{owner}} pull 'everything that just needs a Slack reply'."),
  progress: z.number().int().min(0).max(100).nullable().optional().describe("Quest progress 0–100 for deep tasks. Leave unset to let the app estimate from activity."),
  context: z.string().optional().describe("Markdown background: what this is, why it matters, decisions so far, where things live. Human-readable and the place LLMs should read before starting."),
  channels: z.array(z.string()).optional().describe("Slack channels to watch for this task, e.g. ['#team-growth', '#ads']"),
  skills: z.array(z.string()).optional().describe("Claude skills to load before working on it, e.g. ['bing-ads', 'self-driving-copy']"),
  waiting_on: z.array(z.string()).optional().describe("Names of people this task is blocked on"),
  collaborators: z.array(z.string()).optional().describe("Names of people working on it with {{owner}}"),
  owed_to: z.array(z.string()).optional().describe("Names of people {{owner}} owes something on this task (they're waiting on them)"),
  links: z.array(z.string().url()).optional().describe("URLs to attach (chat, Slack, GitHub, docs). Type is auto-detected."),
}

export function buildServer(addedBy) {
  const server = new McpServer({ name: "task-tracker", version: "0.1.0" }, {
    instructions: s.personalize(
      "{{owner}}'s personal task tracker and context warehouse. Use get_briefing first to see what matters today.\n\n" +
      "HANDOFF DOCS (required). Every task has a `handoff`: a markdown quick-reference for the next LLM or human. It is the first thing you read and the last thing you write.\n" +
      "1. Before working on a task: get_task, read `handoff` (and get_project for the project-level one). If handoff_stale is true, assume it's out of date and reconcile it with the notes and links.\n" +
      "2. While working: add_link for every source you use or produce (this chat, PRs, docs, Slack threads); add_note for progress.\n" +
      "3. Before you stop (end of a chunk of work, or when {{owner}} moves on): update_handoff with the FULL rewritten doc using the sections Current state / Decisions so far / Sources / Next steps / Open questions / Gotchas. Keep it under ~40 lines. Don't append a diary; rewrite so it reads as a current snapshot. Update the project handoff too if you learned something that spans tasks.\n\n" +
      "Priority 1 is urgent, 4 is low. Impact 5 is huge, 1 is tiny. effort quick/medium/deep; next_action is the single next step. " +
      "Put durable background in update_task.append_context; put the live snapshot in the handoff. " +
      "Mark people {{owner}} is waiting on with set_person role=waiting_on; people waiting on THEM with role=owed_to; pass asked=true each time someone pings them. " +
      "NEVER CREATE A DUPLICATE. Before create_task or propose_item kind=new_task, run search(query) and list_tasks(status=[\"done\"]) for the key nouns, person, thread, or PR. If an OPEN task matches, update it (update_task / add_link / add_note). If a FINISHED task matches, reopen it instead of starting over: in a sweep, propose_item kind=update with that task_id ({{owner}}'s accept reopens it and keeps its history); when working directly, update_task(status=\"todo\") plus add_note on what brought it back. A finished task's handoff, links, and closing notes are the context you want; a fresh task throws them away.\n" +
      "Daily sweeps must NOT create tasks directly: use propose_item so {{owner}} can accept or dismiss in their Inbox. " +
      "In proposals, suggested.owed_to is the most important field: if a person asked {{owner}} for something, name them there. effort=quick says how long it takes; owed_to says who is waiting. Both can be true."),
  })
  const by = addedBy
  const tool = (name, description, schema, fn) =>
    server.registerTool(name, { description: s.personalize(description), inputSchema: schema }, wrap(fn))

  tool("get_briefing", "What matters today: overdue, due today, top five to focus on, and who {{owner}} is waiting on.", {}, () => s.briefing())
  tool("list_tasks", "List open tasks sorted by what to do first (due date, priority, impact). Filter as needed.", {
    status: z.array(z.enum(["todo", "in_progress", "blocked", "done"])).optional(),
    include_done: z.boolean().optional(),
    project: z.string().optional(),
    tag: z.string().optional(),
    person: z.string().optional().describe("Only tasks involving this person"),
    blocked: z.boolean().optional().describe("true = only blocked tasks, false = only unblocked"),
    max_priority: z.number().int().min(1).max(4).optional().describe("e.g. 2 = urgent and high only"),
    min_impact: z.number().int().min(1).max(5).optional(),
    effort: z.enum(["quick", "medium", "deep"]).optional(),
    next_action: z.enum(["slack_reply", "email_reply", "creative_review", "write", "build", "decide", "meeting", "research", "wait"]).optional(),
    skill: z.string().optional(), channel: z.string().optional(),
    due_before: z.string().optional(), due_after: z.string().optional(),
    query: z.string().optional().describe("Text search in title/description"),
  }, (a) => s.listTasks(a))
  tool("get_task", "Full detail for one task: links, notes, people, dependencies.", { id: z.number().int() }, ({ id }) => s.getTask(id))
  tool("create_task", "Create a task. First search() and list_tasks(status=[\"done\"]) for a match; update or reopen an existing task rather than creating a near-duplicate.", taskFields, (a) => s.createTask({ ...a, added_by: by }))
  tool("update_task", "Change any field on a task. Only send the fields you want to change. Use append_context to add background without rewriting it.", {
    id: z.number().int(), ...Object.fromEntries(Object.entries(taskFields).filter(([k]) => !["waiting_on", "collaborators", "owed_to", "links"].includes(k)).map(([k, v]) => [k, v.optional()])),
    append_context: z.string().optional(),
  }, ({ id, ...a }) => s.updateTask(id, a))
  tool("update_handoff", "Rewrite a task's handoff doc: the quick-reference the next LLM reads first. Call this before you stop working on a task. Pass the full doc in `handoff` (preferred) or `append` for a small addition. Sections: Current state / Decisions so far / Sources / Next steps / Open questions / Gotchas.", {
    id: z.number().int(), handoff: z.string().optional(), append: z.string().optional(),
  }, ({ id, ...a }) => s.updateHandoff(id, { ...a, updated_by: by }))
  tool("get_handoff_template", "The section skeleton a handoff doc should follow.", {}, () => s.HANDOFF_TEMPLATE)
  tool("get_project", "Project-level view: its handoff doc, open tasks (with which handoffs are stale), every source link across its tasks, channels, skills, people. Read this when starting work in a project.", { name: z.string() }, ({ name }) => s.getProject(name))
  tool("update_project_handoff", "Rewrite (or append to) the project-level handoff: what spans tasks, standing decisions, where the key docs live.", {
    name: z.string(), handoff: z.string().optional(), append: z.string().optional(),
  }, ({ name, ...a }) => s.updateProjectHandoff(name, { ...a, updated_by: by }))
  tool("get_sweep_config", "Call FIRST in a daily sweep. Returns the sweep config (channels, people, seeds — kept in the 'Daily sweep' project handoff so it's editable without touching the prompt), the last sweep-log with its cutoffs, channels watched by open tasks, URLs {{owner}} already dismissed (never re-propose these), and stale handoffs.", {}, () => s.getSweepConfig())
  tool("log_sweep", "Call LAST in a daily sweep. Records a sweep-log note so the next run (in any thread or model) knows where to start. cutoffs = per-source ISO timestamps you covered up to.", {
    summary: z.string().describe("3–8 lines: what you found, what you proposed, gaps"), cutoffs: z.record(z.string(), z.string()).optional(), proposals: z.number().int().optional(), run_type: z.enum(["full", "afternoon"]).optional(),
  }, (a) => s.logSweep({ ...a, added_by: by }))
  tool("stale_handoffs", "In-progress tasks whose handoff is missing or older than their last change. Fix these before {{owner}} switches models.", {}, () => s.staleHandoffs())
  tool("get_hero", "{{owner}}'s quest stats: XP, level, streak, cleared today, and the hedgehog's mood.", {}, () => s.hero())
  tool("you_owe", "Tasks where someone is waiting on {{owner}}: explicit owed_to people, reply-type next actions, or anyone who has pinged them. Most-pinged first. 'What do I owe people?'", {}, () => s.owed())
  tool("quick_wins", "Unblocked tasks marked quick effort, best first. 'What can I knock out right now?'", {}, () => s.quickWins())
  tool("chip_away", "Unblocked deep-effort tasks, best first, with the longest-untouched surfacing. 'What should I make progress on?'", {}, () => s.chipAway())
  tool("complete_task", "Mark a task done. Always pass closing_notes: why/how it closed, what shipped, anything the next person should know. If it repeats, the next occurrence is created and returned.", { id: z.number().int(), closing_notes: z.string().optional() }, ({ id, closing_notes }) => s.completeTask(id, { closing_notes, added_by: by }))
  tool("delete_task", "Permanently delete a task and its notes and links.", { id: z.number().int() }, ({ id }) => s.deleteTask(id))

  tool("add_link", "Attach a URL to a task: this conversation, a Slack message, a GitHub PR or issue, a doc. Type is auto-detected.", {
    task_id: z.number().int(), url: z.string().url(), title: z.string().optional().describe("Short label, e.g. 'Claude chat: drafting the brief'"),
  }, (a) => s.addLink({ ...a, added_by: by }))
  tool("remove_link", "Remove a link by its id.", { id: z.number().int() }, ({ id }) => s.removeLink(id))

  tool("add_note", "Add a note. Attach to a task with task_id, or leave it out for a standalone note.", {
    task_id: z.number().int().optional(), title: z.string().optional(), body: z.string(),
  }, (a) => s.addNote({ ...a, added_by: by }))
  tool("update_note", "Edit a note, or append to it.", {
    id: z.number().int(), title: z.string().optional(), body: z.string().optional(), append: z.string().optional().describe("Text to add at the end instead of replacing"),
  }, ({ id, ...a }) => s.updateNote(id, a))
  tool("delete_note", "Delete a note.", { id: z.number().int() }, ({ id }) => s.deleteNote(id))
  tool("list_notes", "List notes, optionally for one task or matching a search.", {
    task_id: z.number().int().optional(), query: z.string().optional(), standalone: z.boolean().optional().describe("Only notes not attached to a task"),
  }, (a) => s.listNotes(a))

  tool("set_person", "Record that a task involves a person: waiting_on ({{owner}} is blocked on them), owed_to (they are waiting on {{owner}}), or collaborator. Set resolved=true when the thing was delivered. Pass asked=true when they ping {{owner}} about it (counts up, surfaces 'asked twice').", {
    task_id: z.number().int(), name: z.string(), role: z.enum(["waiting_on", "collaborator", "owed_to"]).optional(),
    note: z.string().optional().describe("What you need from them"), resolved: z.boolean().optional(), contact: z.string().optional().describe("Slack handle or email"),
    asked: z.boolean().optional().describe("true = this person just asked {{owner}} about it (increments ask_count)"),
  }, (a) => s.setPerson(a))

  tool("propose_item", "Put a proposal in {{owner}}'s Inbox for them to accept or dismiss. Daily sweeps use this instead of creating tasks. kind: new_task (suggested = task fields), update (task_id + what changed), missing (something they may have dropped), asset (new creative from PPMs to turn into an ad), follow_up (someone is waiting on them). Duplicate URLs are ignored.", {
    kind: z.enum(["new_task", "update", "missing", "asset", "follow_up"]), title: z.string(),
    body: z.string().optional().describe("Why this matters, in 1–3 sentences"), url: z.string().url().optional().describe("Source: the Slack thread, email, PR, Figma file"),
    task_id: z.number().int().optional().describe("Existing task this relates to"),
    suggested: z.object({ priority: z.number().int().min(1).max(4).optional(), impact: z.number().int().min(1).max(5).optional(), effort: z.enum(["quick", "medium", "deep"]).optional(), next_action: z.enum(["slack_reply", "email_reply", "creative_review", "write", "build", "decide", "meeting", "research", "wait"]).optional().describe("One of the fixed values. Put the actual next step sentence in body."), due_date: z.string().optional().describe("YYYY-MM-DD"), project: z.string().optional(), owed_to: z.array(z.string()).optional().describe("People WAITING ON {{owner}} for this (they asked them). Always set when someone is owed a reply, review, decision, or deliverable."), waiting_on: z.array(z.string()).optional().describe("People {{owner}} is waiting on"), channels: z.array(z.string()).optional(), skills: z.array(z.string()).optional(), links: z.array(z.string()).optional(), reopen: z.boolean().optional().describe("For kind=update on a FINISHED task: accepting reopens it (default true). Set false to only attach the note/link.") }).optional().describe("Field values to apply if {{owner}} accepts"),
  }, (a) => s.proposeItem({ ...a, added_by: by }))
  tool("list_inbox", "Inbox proposals. Default: only new ones.", { status: z.enum(["new", "accepted", "dismissed", "all"]).optional(), kind: z.enum(["new_task", "update", "missing", "asset", "follow_up"]).optional() }, (a) => s.listInbox(a))
  tool("accept_item", "Accept an inbox proposal (only after {{owner}} says yes). new_task creates the task; others attach to the linked task.", { id: z.number().int(), overrides: z.record(z.string(), z.any()).optional() }, ({ id, overrides }) => s.acceptItem(id, overrides))
  tool("dismiss_item", "Dismiss an inbox proposal.", { id: z.number().int() }, ({ id }) => s.dismissItem(id))
  tool("list_skills", "Skills referenced by open tasks, with counts.", {}, () => s.skillsInUse())
  tool("list_channels", "Slack channels being watched across open tasks, with counts.", {}, () => s.channelsInUse())
  tool("remove_person", "Remove a person from a task.", { task_id: z.number().int(), name: z.string(), role: z.enum(["waiting_on", "collaborator", "owed_to"]).optional() }, (a) => s.removePerson(a))
  tool("list_people", "Everyone on any task, with how many tasks are waiting on each of them.", {}, () => s.listPeople())
  tool("add_dependency", "Make task_id wait on depends_on_id finishing first.", { task_id: z.number().int(), depends_on_id: z.number().int() }, (a) => s.addDependency(a.task_id, a.depends_on_id))
  tool("remove_dependency", "Remove a task dependency.", { task_id: z.number().int(), depends_on_id: z.number().int() }, (a) => s.removeDependency(a.task_id, a.depends_on_id))

  tool("calendar", "Tasks with due dates in a range (inclusive), for planning a week or month.", { from: z.string(), to: z.string() }, (a) => s.calendar(a.from, a.to))
  tool("search", "Search tasks, notes, and links for a word or phrase.", { query: z.string() }, ({ query }) => s.search(query))
  tool("list_projects", "Project names in use.", {}, () => s.projects())
  return server
}
