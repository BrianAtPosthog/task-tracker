// One process serves the desktop UI's JSON API and the MCP endpoint ChatGPT/Claude reach through the tunnel.
import express from "express"
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { buildServer } from "./mcp.js"
import * as s from "./store.js"

const PORT = Number(process.env.PORT || 3789)
const here = path.dirname(fileURLToPath(import.meta.url))

// A secret in the URL keeps strangers who find the tunnel address out. Generated once, stored next to the database.
const tokenFile = path.join(s.dataDir, "mcp-token")
if (!fs.existsSync(tokenFile)) fs.writeFileSync(tokenFile, crypto.randomBytes(18).toString("base64url"))
export const TOKEN = fs.readFileSync(tokenFile, "utf8").trim()

const app = express()
app.use(express.json({ limit: "2mb" }))

// ---- MCP over HTTP (stateless; each request gets a fresh server+transport) ----
app.all(`/mcp/${TOKEN}`, async (req, res) => {
  const ua = String(req.headers["user-agent"] || "").toLowerCase()
  const by = ua.includes("openai") || ua.includes("chatgpt") ? "chatgpt" : ua.includes("claude") || ua.includes("anthropic") ? "claude" : "mcp"
  const server = buildServer(by)
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  res.on("close", () => { transport.close(); server.close() })
  await server.connect(transport)
  await transport.handleRequest(req, res, req.body)
})
app.all("/mcp", (_req, res) => res.status(401).json({ error: "Missing token. Use the URL shown in the app." }))

// ---- JSON API for the UI ----
const api = express.Router()
const h = (fn) => async (req, res) => { try { res.json(await fn(req)) } catch (e) { res.status(400).json({ error: e.message }) } }
const id = (r) => Number(r.params.id)
api.get("/briefing", h(() => s.briefing()))
api.get("/tasks", h((r) => s.listTasks({ ...r.query, include_done: r.query.include_done === "true", blocked: r.query.blocked === undefined ? undefined : r.query.blocked === "true" })))
api.post("/tasks", h((r) => s.createTask(r.body)))
api.get("/tasks/:id", h((r) => s.getTask(id(r))))
api.patch("/tasks/:id", h((r) => s.updateTask(id(r), r.body)))
api.post("/tasks/:id/complete", h((r) => s.completeTask(id(r), { closing_notes: r.body?.closing_notes, added_by: "me" })))
api.delete("/tasks/:id", h((r) => s.deleteTask(id(r))))
api.post("/tasks/:id/links", h((r) => s.addLink({ task_id: id(r), ...r.body })))
api.delete("/links/:id", h((r) => s.removeLink(id(r))))
api.post("/tasks/:id/people", h((r) => s.setPerson({ task_id: id(r), ...r.body })))
api.delete("/tasks/:id/people", h((r) => s.removePerson({ task_id: id(r), ...r.body })))
api.post("/tasks/:id/deps", h((r) => s.addDependency(id(r), Number(r.body.depends_on_id))))
api.delete("/tasks/:id/deps/:dep", h((r) => s.removeDependency(id(r), Number(r.params.dep))))
api.get("/notes", h((r) => s.listNotes({ ...r.query, task_id: r.query.task_id ? Number(r.query.task_id) : undefined, standalone: r.query.standalone === "true" })))
api.post("/notes", h((r) => s.addNote(r.body)))
api.patch("/notes/:id", h((r) => s.updateNote(id(r), r.body)))
api.delete("/notes/:id", h((r) => s.deleteNote(id(r))))
api.get("/people", h(() => s.listPeople()))
api.get("/quick-wins", h(() => s.quickWins()))
api.get("/owed", h(() => s.owed()))
api.get("/hero", h(() => s.hero()))
api.get("/chip-away", h(() => s.chipAway()))
api.get("/inbox", h((r) => s.listInbox(r.query)))
api.post("/inbox", h((r) => s.proposeItem(r.body)))
api.post("/inbox/:id/accept", h((r) => s.acceptItem(id(r), r.body?.overrides)))
api.post("/inbox/:id/dismiss", h((r) => s.dismissItem(id(r))))
api.get("/skills", h(() => s.skillsInUse()))
api.put("/tasks/:id/handoff", h((r) => s.updateHandoff(id(r), r.body)))
api.get("/projects/:name", h((r) => s.getProject(r.params.name)))
api.put("/projects/:name/handoff", h((r) => s.updateProjectHandoff(r.params.name, r.body)))
api.get("/sweep-config", h(() => s.getSweepConfig()))
api.post("/sweep-log", h((r) => s.logSweep(r.body)))
api.get("/backups", h(() => ({ dir: s.backupDir, backups: s.listBackups() })))
api.post("/backups", h(() => s.backupNow({ force: true })))
api.get("/handoff-template", h(() => ({ template: s.HANDOFF_TEMPLATE })))
api.get("/channels", h(() => s.channelsInUse()))
api.get("/projects", h(() => s.projects()))
api.get("/calendar", h((r) => s.calendar(r.query.from, r.query.to)))
api.get("/search", h((r) => s.search(r.query.q || "")))
api.get("/meta", h(() => ({ token: TOKEN, port: PORT, data_dir: s.dataDir, project_dir: path.resolve(here, ".."), today: s.today() })))
app.use("/api", api)

app.use(express.static(path.join(here, "..", "public")))

function scheduleBackups() {
  const run = () => s.backupNow().then((r) => { if (!r.skipped) console.log(`Backup written: ${r.path} (${r.kept} kept)`) }).catch((e) => console.error("Backup failed:", e.message))
  run()
  setInterval(run, 60 * 60 * 1000) // hourly check; writes once per calendar day
}
export function start() {
  scheduleBackups()
  return new Promise((resolve) => {
    const srv = app.listen(PORT, "127.0.0.1", () => {
      console.log(`Task tracker UI:  http://localhost:${PORT}`)
      console.log(`MCP endpoint:     http://localhost:${PORT}/mcp/${TOKEN}`)
      resolve(srv)
    })
  })
}
if (process.argv[1] === fileURLToPath(import.meta.url)) start()
