// Pixel sprites as text grids → crisp inline SVG. One letter per pixel; "." is transparent.
// Keep sprites tiny (8–16px) and let CSS scale them; shape-rendering keeps the edges hard.
const PAL = {
  k: "#1a1023", // outline
  w: "#ffffff",
  b: "#6b4a2b", // hog brown
  B: "#3e2a17", // hog dark brown
  c: "#f2c9a0", // hog face cream
  p: "#f08a8a", // nose/pink
  y: "#ffd23f", // yellow
  o: "#ff8c1a", // orange
  r: "#e8385d", // red
  g: "#7ac142", // green
  G: "#2e7d32",
  l: "#5cc8ff", // light blue
  d: "#2b4bb3", // blue
  m: "#8e4585", // grape
  s: "#c0c0c0", // silver
  S: "#707070",
  t: "#c8a165", // tan/wood
  T: "#8a6a3a",
  e: "#222",
}

const SPRITES = {
  // 16x16 hedgehog hero, facing right
  hog: `
................
......kkkkk.....
....kkBBBBBkk...
...kBBbBbBBBBk..
..kBbBbBbBbBBBk.
..kBbBbBbBbBBBk.
.kBbBbBbBbBBcck.
.kBbBbBbBbBcccck
.kBbBbBbBbBckcck
.kBBbBbBbBBccpck
..kBBBBBBBBcccck
..kBBBBBBBBcck..
...kBBBBBBBk....
....kBkkkBk.....
....kk...kk.....
................`,
  hogHappy: `
................
......kkkkk.....
....kkBBBBBkk...
...kBBbBbBBBBk..
..kBbBbBbBbBBBk.
..kBbBbBbBbBBBk.
.kBbBbBbBbBBcck.
.kBbBbBbBbBcccck
.kBbBbBbBbBcwcck
.kBBbBbBbBBccpck
..kBBBBBBBBcrcck
..kBBBBBBBBcck..
...kBBBBBBBk....
....kBkkkBk.....
....kk...kk.....
................`,
  hogSleep: `
................
................
......kkkkk...ll
....kkBBBBBkk.l.
...kBBbBbBBBBk..
..kBbBbBbBbBBBk.
..kBbBbBbBbBBBk.
.kBbBbBbBbBBcck.
.kBbBbBbBbBcccck
.kBbBbBbBbBkkcck
.kBBbBbBbBBccpck
..kBBBBBBBBcccck
..kBBBBBBBBcck..
...kBBBBBBBk....
....kBkkkBk.....
................`,
  // 12x16 villager (NPC), palette slots: h=hair, f=face, s=shirt
  npc: `
....kkkk....
...khhhhk...
..khhhhhhk..
..kffffffk..
..kfkffkfk..
..kffffffk..
...kffffk...
....kkkk....
..kkssssskk.
.kfksssssskf
.kfksssssskf
..kkssssskk.
...kssssk...
...kkkkkk...
...kee.eek..
...kk...kk..`,
  // 8x8 icons
  bang: `
...kk...
..kyyk..
..kyyk..
..kyyk..
..kyyk..
...kk...
..kyyk..
...kk...`,
  scroll: `
.kkkkkk.
ktwwwwtk
ktwkkwtk
ktwwwwtk
ktwkkwtk
ktwwwwtk
ktTTTTtk
.kkkkkk.`,
  sword: `
......kk
.....kwk
....kwk.
...kwk..
kk.kk...
kykk....
kkyk....
k..k....`,
  flag: `
k.......
krrrrr..
krrrrrr.
krrrrr..
krrrr...
k.......
k.......
k.......`,
  trophy: `
kkkkkkkk
kyyyyyyk
kyyyyyyk
.kyyyyk.
..kyyk..
...kk...
..kyyk..
.kkkkkk.`,
  heart: `
.kk..kk.
krrkkrrk
krrrrrrk
krrrrrrk
.krrrrk.
..krrk..
...kk...
........`,
  star: `
...kk...
...kyk..
.kkkyykk
kyyyyyyk
.kyyyyk.
.kyyyyk.
kyk..kyk
kk....kk`,
  chest: `
.kkkkkk.
kTttttTk
kTtyytTk
kkkkkkkk
kTttttTk
kTtkktTk
kTttttTk
.kkkkkk.`,
  inn: `
...kk...
..krrk..
.krrrrk.
krrrrrrk
kwwwwwwk
kwkkwkwk
kwkkwkwk
kkkkkkkk`,
  map: `
kkkkkkkk
ktgggttk
ktgGggtk
ktggGttk
kttlltlk
ktlllltk
kttttttk
kkkkkkkk`,
  skull: `
.kkkkkk.
kwwwwwwk
kwkwwkwk
kwwwwwwk
.kwkkwk.
.kkwwkk.
..kkkk..
........`,
}

export function sprite(name, { size = 4, palette = {}, cls = "" } = {}) {
  const rows = SPRITES[name].trim().split("\n")
  const h = rows.length, w = rows[0].length
  const pal = { ...PAL, ...palette }
  let rects = ""
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = rows[y][x]
    if (ch === "." || !pal[ch]) continue
    rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${pal[ch]}"/>`
  }
  return `<svg class="px ${cls}" viewBox="0 0 ${w} ${h}" width="${w * size}" height="${h * size}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`
}

// Deterministic villager colours per person name, so Cory always looks like Cory.
const HAIR = ["#3e2a17", "#111", "#c9a227", "#b23121", "#777", "#f2c9a0", "#4a2f8f"]
const SHIRT = ["#2b4bb3", "#e8385d", "#7ac142", "#ff8c1a", "#8e4585", "#0095b6", "#5c8a6b"]
const SKIN = ["#f2c9a0", "#d9a06b", "#a86f3c", "#6e4426"]
export function npc(name, size = 4) {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return sprite("npc", { size, palette: { h: HAIR[h % HAIR.length], s: SHIRT[(h >> 3) % SHIRT.length], f: SKIN[(h >> 6) % SKIN.length] } })
}
