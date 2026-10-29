// Generates the app icon (assets/icon.png → icon.icns) and the menu-bar template icon with no image libraries:
// draws pixels by hand and writes PNGs with zlib. Run: node scripts/make-icons.js
import fs from "node:fs"
import path from "node:path"
import zlib from "node:zlib"
import { execSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "assets")
fs.mkdirSync(out, { recursive: true })

function png(w, h, pixel) { // pixel(x, y) → [r, g, b, a]
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = pixel(x, y)
      raw.set([r, g, b, a], y * (w * 4 + 1) + 1 + x * 4)
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))])
}

// Shapes, in a 0..1 coordinate space, with soft edges for anti-aliasing.
const smooth = (d, px) => Math.max(0, Math.min(1, 0.5 - d / px))
const roundedSquare = (x, y, r) => { const qx = Math.abs(x - 0.5) - (0.5 - r), qy = Math.abs(y - 0.5) - (0.5 - r); return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r }
const segDist = (px, py, ax, ay, bx, by) => { const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2))); return Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay))) }
const check = (x, y, thick) => Math.min(segDist(x, y, 0.28, 0.52, 0.44, 0.68), segDist(x, y, 0.44, 0.68, 0.74, 0.34)) - thick

// App icon: blue rounded square, white check. 1024px (macOS wants this size at the top end).
const N = 1024, pxw = 1 / N
fs.writeFileSync(path.join(out, "icon.png"), png(N, N, (ix, iy) => {
  const x = (ix + 0.5) / N, y = (iy + 0.5) / N
  const bg = smooth(roundedSquare(x, y, 0.22), pxw * 1.5)
  const grad = 1 - (y - 0.1) * 0.35
  const ck = smooth(check(x, y, 0.07), pxw * 1.5)
  const r = 47 * grad * (1 - ck) + 255 * ck, g = 111 * grad * (1 - ck) + 255 * ck, b = 237 * grad * (1 - ck) + 255 * ck
  return [r, g, b, 255 * bg]
}))

// Menu bar icon: macOS "template" image = black with alpha; it recolors itself for light/dark menu bars. 22pt → 44px @2x.
for (const [size, name] of [[22, "trayTemplate.png"], [44, "trayTemplate@2x.png"]]) {
  const p = 1 / size
  fs.writeFileSync(path.join(out, name), png(size, size, (ix, iy) => {
    const x = (ix + 0.5) / size, y = (iy + 0.5) / size
    const ring = Math.abs(Math.hypot(x - 0.5, y - 0.5) - 0.36) - 0.055
    const a = Math.max(smooth(ring, p * 1.2), smooth(check(x, y, 0.065), p * 1.2))
    return [0, 0, 0, 255 * a]
  }))
}

// .icns for the packaged app bundle (macOS only).
if (process.platform === "darwin") {
  const set = path.join(out, "icon.iconset")
  fs.mkdirSync(set, { recursive: true })
  for (const s of [16, 32, 64, 128, 256, 512, 1024]) {
    const names = s === 1024 ? ["icon_512x512@2x.png"] : [`icon_${s}x${s}.png`, ...(s >= 32 ? [`icon_${s / 2}x${s / 2}@2x.png`] : [])]
    for (const n of names) execSync(`sips -z ${s} ${s} "${path.join(out, "icon.png")}" --out "${path.join(set, n)}" >/dev/null`)
  }
  execSync(`iconutil -c icns "${set}" -o "${path.join(out, "icon.icns")}"`)
  fs.rmSync(set, { recursive: true })
}
console.log("icons written to", out)
