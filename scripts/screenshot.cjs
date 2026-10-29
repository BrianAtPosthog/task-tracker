// Captures each view at real window size for visual checks. Usage: npx electron scripts/screenshot.cjs [mode] [theme]
// Writes PNGs to ~/.task-tracker/shots/. Needs the server running on 3789.
const { app, BrowserWindow } = require("electron")
const fs = require("node:fs"), path = require("node:path"), os = require("node:os")
const mode = process.argv[2] || "quest", theme = process.argv[3] || "platinum"
const out = path.join(os.homedir(), ".task-tracker", "shots"); fs.mkdirSync(out, { recursive: true })
const views = ["focus", "deep", "quick", "owed", "inbox", "people", "map", "victory", "calendar"]
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1280, height: 860, show: false, webPreferences: { contextIsolation: true } })
  await win.loadURL("http://localhost:3789/")
  await win.webContents.executeJavaScript(`localStorage.setItem("mode","${mode}");localStorage.setItem("theme","${theme}");1`)
  await win.loadURL("http://localhost:3789/?v=" + Date.now())
  await new Promise((r) => setTimeout(r, 1500))
  for (const v of views) {
    await win.webContents.executeJavaScript(`document.querySelector('[data-view="${v}"]')?.click();1`)
    await new Promise((r) => setTimeout(r, 1200))
    const img = await win.webContents.capturePage()
    fs.writeFileSync(path.join(out, `${mode}-${v}.png`), img.toPNG())
  }
  // one with the detail panel open on the first visible task
  await win.webContents.executeJavaScript(`document.querySelector('[data-view="focus"]').click();1`)
  await new Promise((r) => setTimeout(r, 1000))
  await win.webContents.executeJavaScript(`document.querySelector('.qrow[data-id], .task[data-id]')?.click();1`)
  await new Promise((r) => setTimeout(r, 1000))
  fs.writeFileSync(path.join(out, `${mode}-detail.png`), (await win.webContents.capturePage()).toPNG())
  console.log("wrote", views.length + 1, "shots to", out)
  app.quit()
})
