const { app, BrowserWindow, Tray, Menu, shell, nativeImage, nativeTheme } = require("electron")
const path = require("node:path")
const { pathToFileURL } = require("node:url")

app.setName("Tasks")
const port = process.env.PORT || 3789
const base = `http://localhost:${port}`
let win, tray

async function ensureServer() {
  // The login item (scripts/install-login-items.sh) normally has the server running already; only start one if not.
  const up = await fetch(`${base}/api/meta`).then((r) => r.ok).catch(() => false)
  if (up) return
  const { start } = await import(pathToFileURL(path.join(__dirname, "..", "src", "server.js")).href)
  await start()
}

function openWindow(hash = "") {
  if (win && !win.isDestroyed()) {
    if (hash) win.loadURL(`${base}/#${hash}`)
    win.show(); win.focus()
    if (app.dock) app.dock.show()
    return
  }
  win = new BrowserWindow({
    width: 1280, height: 860, minWidth: 820, minHeight: 500, title: "Tasks", titleBarStyle: "hiddenInset",
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#171716" : "#f6f6f4",
    webPreferences: { contextIsolation: true },
  })
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" } })
  win.loadURL(`${base}/${hash ? "#" + hash : ""}`)
  // Closing the window keeps the app in the menu bar; Cmd+Q quits.
  win.on("close", (e) => { if (!app.isQuitting) { e.preventDefault(); win.hide(); if (app.dock) app.dock.hide() } })
}

const fmtDue = (d) => (d ? ` · ${new Date(d + "T00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : "")
async function buildTrayMenu() {
  let b = null
  try { b = await fetch(`${base}/api/briefing`).then((r) => r.json()) } catch {}
  const item = (t) => ({ label: `${t.priority === 1 ? "‼ " : t.priority === 2 ? "! " : ""}${t.title.slice(0, 48)}${fmtDue(t.due_date)}`, click: () => openWindow(`task=${t.id}`) })
  const section = (label, list) => (list?.length ? [{ label, enabled: false }, ...list.slice(0, 5).map(item), { type: "separator" }] : [])
  const template = [
    { label: "Open Tasks", click: () => openWindow(), accelerator: "CmdOrCtrl+O" },
    { label: "New task…", click: () => openWindow("new"), accelerator: "CmdOrCtrl+N" },
    { type: "separator" },
    ...(b
      ? [
          ...(b.inbox_new ? [{ label: `📥 ${b.inbox_new} proposal${b.inbox_new > 1 ? "s" : ""} in Inbox`, click: () => openWindow("view=inbox") }, { type: "separator" }] : []),
          ...section("Overdue", b.overdue),
          ...section("Due today", b.due_today),
          ...section("💸 You owe", b.you_owe),
          ...section("Focus next", b.top_focus),
          ...section("⚡ Quick wins", b.quick_wins),
          { label: `${b.counts.open} open · ${b.counts.blocked} blocked · ${b.counts.quick} quick`, enabled: false },
        ]
      : [{ label: "Server not reachable", enabled: false }]),
    { type: "separator" },
    { label: "Quit Tasks", role: "quit" },
  ]
  tray.setContextMenu(Menu.buildFromTemplate(template))
  if (b) tray.setTitle(b.overdue.length ? ` ${b.overdue.length}` : "")
}

app.whenReady().then(async () => {
  await ensureServer()
  const icon = nativeImage.createFromPath(path.join(__dirname, "..", "assets", "trayTemplate.png"))
  icon.setTemplateImage(true)
  tray = new Tray(icon)
  tray.setToolTip("Tasks")
  await buildTrayMenu()
  setInterval(buildTrayMenu, 60_000)
  tray.on("click", buildTrayMenu) // refresh right before it opens
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "Tasks", submenu: [{ role: "about" }, { type: "separator" }, { role: "hide" }, { role: "quit" }] },
    { label: "File", submenu: [{ label: "New task", accelerator: "CmdOrCtrl+N", click: () => openWindow("new") }, { role: "close" }] },
    { role: "editMenu" }, { role: "viewMenu" }, { role: "windowMenu" },
  ]))
  openWindow()
})
app.on("before-quit", () => { app.isQuitting = true })
app.on("activate", () => openWindow())
app.on("window-all-closed", () => {}) // stay in the menu bar
