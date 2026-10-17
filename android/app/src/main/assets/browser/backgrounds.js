const PALETTE = { ground: '#030806', deep: '#06140c', green: '#33ff66', mint: '#9dffbb', teal: '#1fd1a8' }

const TINT = { green: '51,255,102', mint: '157,255,187', teal: '31,209,168', white: '225,255,235', amber: '255,196,92', pink: '255,170,200' }

function seededRandom(seed) {
  let state = seed >>> 0
  return function () {
    state = (state + 0x6D2B79F5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function valueNoise(random) {
  const SIZE = 256
  const values = new Float32Array(SIZE * SIZE)
  for (let i = 0; i < values.length; i++) values[i] = random()
  const smooth = (t) => t * t * (3 - 2 * t)
  const at = (x, y) => values[((y & 255) * SIZE) + (x & 255)]
  const layer = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y)
    const fx = smooth(x - ix), fy = smooth(y - iy)
    const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * fx
    const bottom = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * fx
    return top + (bottom - top) * fy
  }
  return (x, y) => layer(x, y) * 0.6 + layer(x * 2.1, y * 2.1) * 0.3 + layer(x * 4.3, y * 4.3) * 0.1
}

function glowDot(ctx, x, y, radius, blur, color, alpha) {
  const outer = radius + blur
  const g = ctx.createRadialGradient(x, y, 0, x, y, outer)
  g.addColorStop(0, `rgba(${color},${alpha})`)
  g.addColorStop(Math.max(0.01, radius / outer), `rgba(${color},${alpha * 0.8})`)
  g.addColorStop(1, `rgba(${color},0)`)
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, outer, 0, Math.PI * 2)
  ctx.fill()
}

function darkSky(ctx, w, h, low) {
  const sky = ctx.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, '#010302')
  sky.addColorStop(0.7, low || '#0b2615')
  sky.addColorStop(1, '#020504')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h)
}

function readabilityFade(ctx, w, h) {
  const fade = ctx.createLinearGradient(0, 0, 0, h)
  fade.addColorStop(0, 'rgba(3,8,6,0.05)')
  fade.addColorStop(0.32, 'rgba(3,8,6,0.55)')
  fade.addColorStop(0.5, 'rgba(3,8,6,0.55)')
  fade.addColorStop(0.72, 'rgba(3,8,6,0.05)')
  fade.addColorStop(1, 'rgba(3,8,6,0.12)')
  ctx.fillStyle = fade
  ctx.fillRect(0, 0, w, h)
}

function drawSeafloor(ctx, w, h, random) {
  drawSeafloorBase(ctx, w, h, random)
  const sandY = h * 0.94
  const sand = ctx.createLinearGradient(0, sandY - h * 0.03, 0, h)
  sand.addColorStop(0, 'rgba(20,50,35,0)')
  sand.addColorStop(1, 'rgba(20,50,35,0.85)')
  ctx.fillStyle = sand
  ctx.fillRect(0, sandY - h * 0.03, w, h * 0.09)
  const fish = (x, y, s, dir, color) => {
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(dir, 1)
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.ellipse(0, 0, s, s * 0.38, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath(); ctx.moveTo(-s * 0.8, 0); ctx.lineTo(-s * 1.4, -s * 0.4); ctx.lineTo(-s * 1.4, s * 0.4); ctx.fill()
    ctx.restore()
  }
  const schools = 1 + Math.floor(random() * 2)
  for (let sc = 0; sc < schools; sc++) {
    const cx = w * (0.15 + random() * 0.7), cy = h * (0.15 + random() * 0.5)
    const dir = random() < 0.5 ? 1 : -1
    const n = 6 + Math.floor(random() * 10)
    for (let f = 0; f < n; f++) fish(cx + (random() - 0.5) * w * 0.3, cy + (random() - 0.5) * h * 0.08, w * (0.012 + random() * 0.008), dir, `rgba(157,255,220,${0.35 + random() * 0.35})`)
  }
  if (random() < 0.1) {
    const jx = w * (0.2 + random() * 0.6), jy = h * (0.12 + random() * 0.2), jr = w * (0.06 + random() * 0.04)
    glowDot(ctx, jx, jy, jr * 0.5, jr * 1.2, TINT.teal, 0.35)
    ctx.fillStyle = 'rgba(157,255,220,0.45)'
    ctx.beginPath(); ctx.ellipse(jx, jy, jr, jr * 0.65, 0, Math.PI, 0); ctx.fill()
    ctx.strokeStyle = 'rgba(157,255,220,0.4)'
    ctx.lineWidth = 1
    for (let t = 0; t < 8; t++) {
      const tx = jx - jr * 0.8 + t * jr * 0.23
      ctx.beginPath(); ctx.moveTo(tx, jy)
      for (let k = 1; k <= 12; k++) ctx.lineTo(tx + Math.sin(k * 0.8 + t) * jr * 0.08, jy + k * jr * 0.12)
      ctx.stroke()
    }
  }
}

function drawSeafloorBase(ctx, w, h, random) {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#04261c')
  g.addColorStop(0.5, '#03140f')
  g.addColorStop(1, '#010604')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  ctx.globalCompositeOperation = 'lighter'
  for (let r = 0; r < 7; r++) {
    const x = random() * w
    const ray = ctx.createLinearGradient(x, 0, x + w * 0.2, h * 0.7)
    ray.addColorStop(0, 'rgba(120,255,200,0.06)')
    ray.addColorStop(1, 'rgba(120,255,200,0)')
    ctx.fillStyle = ray
    ctx.beginPath()
    ctx.moveTo(x, 0); ctx.lineTo(x + w * 0.05, 0); ctx.lineTo(x + w * 0.3, h * 0.7); ctx.lineTo(x + w * 0.15, h * 0.7)
    ctx.fill()
  }
  ctx.globalCompositeOperation = 'source-over'
  const WEEDS = 10 + Math.floor(random() * 8)
  for (let s = 0; s < WEEDS; s++) {
    const x0 = random() * w
    const height = h * (0.2 + random() * 0.35)
    const freq = 2 + random() * 3, phase = random() * 6, amp = w * (0.02 + random() * 0.04)
    const width = w * (0.008 + random() * 0.012)
    const depth = random()
    ctx.fillStyle = `rgba(${Math.round(20 + depth * 20)},${Math.round(90 + depth * 120)},${Math.round(70 + depth * 60)},${0.4 + depth * 0.4})`
    ctx.beginPath()
    const pts = []
    for (let k = 0; k <= 40; k++) {
      const t = k / 40
      pts.push([x0 + Math.sin(t * freq + phase) * amp * t, h - t * height, width * (1 - t * 0.85)])
    }
    ctx.moveTo(pts[0][0] - pts[0][2], pts[0][1])
    for (const [x, y, wd] of pts) ctx.lineTo(x - wd, y)
    for (let k = pts.length - 1; k >= 0; k--) ctx.lineTo(pts[k][0] + pts[k][2], pts[k][1])
    ctx.fill()
  }
  const coral = (x, y, ang, len, thick, depth) => {
    if (depth === 0 || len < 3) return
    const nx = x + Math.cos(ang) * len, ny = y + Math.sin(ang) * len
    ctx.strokeStyle = `rgba(31,209,168,${0.35 + depth * 0.07})`
    ctx.lineWidth = thick
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(nx, ny)
    ctx.stroke()
    const n = random() < 0.4 ? 3 : 2
    for (let k = 0; k < n; k++) coral(nx, ny, ang + (k - (n - 1) / 2) * (0.5 + random() * 0.3), len * (0.72 + random() * 0.1), thick * 0.75, depth - 1)
  }
  const CORALS = 2 + Math.floor(random() * 3)
  for (let c = 0; c < CORALS; c++) coral(random() * w, h + 2, -Math.PI / 2 + (random() - 0.5) * 0.4, h * (0.05 + random() * 0.04), w * 0.022, 7)
  for (let b = 0; b < 40; b++) {
    const x = random() * w, y = random() * h, r = 1.5 + random() * 5
    ctx.strokeStyle = `rgba(157,255,220,${0.15 + random() * 0.35})`
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.stroke()
  }
}

function drawLightning(ctx, w, h, random) {
  const noise = valueNoise(random)
  const sky = ctx.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, '#020805')
  sky.addColorStop(0.7, '#0a2214')
  sky.addColorStop(1, '#020504')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h)
  const BOLTS = 1 + (random() < 0.45 ? 1 : 0) + (random() < 0.15 ? 1 : 0)
  const strikes = []
  for (let b = 0; b < BOLTS; b++) strikes.push(w * (0.15 + random() * 0.7))
  const cloudBase = h * (0.18 + random() * 0.1)
  const img = ctx.getImageData(0, 0, w, h)
  for (let y = 0; y < cloudBase * 1.6; y += 2) for (let x = 0; x < w; x += 2) {
    const n = noise(x / w * 3.5, y / h * 7) * 0.65 + noise(x / w * 11, y / h * 20) * 0.35
    const fade = Math.max(0, 1 - y / (cloudBase * 1.6))
    let lit = 0
    for (const sx of strikes) lit += Math.exp(-(((x - sx) / (w * 0.28)) ** 2)) * Math.exp(-(((y - cloudBase) / (h * 0.12)) ** 2))
    const v = Math.max(0, n - 0.35) * fade
    const g = v * (60 + lit * 240)
    for (let yy = 0; yy < 2; yy++) for (let xx = 0; xx < 2; xx++) {
      const p = ((y + yy) * w + x + xx) * 4
      img.data[p] = Math.min(255, img.data[p] + g * 0.35)
      img.data[p + 1] = Math.min(255, img.data[p + 1] + g)
      img.data[p + 2] = Math.min(255, img.data[p + 2] + g * 0.6)
    }
  }
  ctx.putImageData(img, 0, 0)
  const groundY = h * (0.86 + random() * 0.06)
  ctx.globalCompositeOperation = 'lighter'
  for (const sx of strikes) {
    const segs = []
    const toGround = random() < 0.75
    boltPath(sx, cloudBase, Math.PI / 2 + (random() - 0.5) * 0.3, toGround ? groundY - cloudBase : (groundY - cloudBase) * (0.4 + random() * 0.3), 2, random, segs, 3.6)
    for (const [pass, alpha, widen] of [[0, 0.12, 9], [1, 0.3, 3.5], [2, 1, 1]]) {
      ctx.strokeStyle = pass === 2 ? `rgba(235,255,240,${alpha})` : `rgba(120,255,170,${alpha})`
      ctx.lineCap = 'round'
      for (const [x1, y1, x2, y2, wd] of segs) {
        ctx.lineWidth = Math.max(0.6, wd * widen)
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
      }
    }
    if (toGround) glowDot(ctx, segs.length ? segs[0][0] : sx, groundY, 2, w * 0.12, '157,255,187', 0.35)
  }
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = '#010302'
  ctx.beginPath()
  ctx.moveTo(0, h)
  for (let x = 0; x <= w; x += 4) ctx.lineTo(x, groundY - noise(x / w * 4, 50) * h * 0.04)
  ctx.lineTo(w, h)
  ctx.fill()
  ctx.strokeStyle = 'rgba(70,140,95,0.35)'
  ctx.lineWidth = 1
  for (let r = 0; r < 70; r++) {
    const x = random() * w, y = random() * h * 0.9
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 14 + random() * 10); ctx.stroke()
  }
}

function boltPath(x, y, ang, len, depth, random, out, width) {
  let cx = x, cy = y
  const steps = Math.max(4, Math.round(len / 14))
  for (let s = 0; s < steps; s++) {
    ang += (random() - 0.5) * 0.9
    ang += (Math.PI / 2 - ang) * 0.15
    const nx = cx + Math.cos(ang) * len / steps, ny = cy + Math.sin(ang) * len / steps
    out.push([cx, cy, nx, ny, width * (1 - s / steps * 0.5)])
    cx = nx; cy = ny
    if (depth > 0 && random() < 0.09) boltPath(cx, cy, ang + (random() < 0.5 ? -1 : 1) * (0.4 + random() * 0.7), len * (0.25 + random() * 0.35), depth - 1, random, out, width * 0.45)
  }
  return [cx, cy]
}

function drawDandelionScene(ctx, w, h, random) {
  darkSky(ctx, w, h, '#0a2414')
  ctx.globalCompositeOperation = 'lighter'
  for (let b = 0; b < 26; b++) {
    const r = w * (0.02 + random() * 0.08)
    glowDot(ctx, random() * w, random() * h, r * 0.5, r, random() < 0.5 ? TINT.green : TINT.teal, 0.05 + random() * 0.07)
  }
  ctx.globalCompositeOperation = 'source-over'
  const heads = random() < 0.4 ? 2 : 1
  for (let k = 0; k < heads; k++) {
    if (k === 1) {
      ctx.save()
      ctx.translate(random() < 0.5 ? -w * 0.28 : w * 0.28, h * 0.05)
      ctx.globalAlpha = 0.45
      ctx.scale(1, 1)
    }
    drawDandelion(ctx, w, h, random, true)
    if (k === 1) ctx.restore()
  }
}

function drawDandelion(ctx, w, h, random, skipSky) {
  if (!skipSky) darkSky(ctx, w, h, '#0a2414')
  const cx = w * (0.3 + random() * 0.4), cy = h * (0.68 + random() * 0.1)
  const R = w * (0.2 + random() * 0.08)
  ctx.strokeStyle = 'rgba(51,255,102,0.5)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.quadraticCurveTo(cx + (random() - 0.5) * w * 0.15, (cy + h) / 2, cx + (random() - 0.5) * w * 0.1, h + 5)
  ctx.stroke()
  const tuft = (x, y, r, alpha, ang) => {
    ctx.strokeStyle = `rgba(225,255,235,${alpha})`
    ctx.lineWidth = 0.6
    for (let k = 0; k < 11; k++) {
      const a = ang + (k / 10 - 0.5) * 2.4
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
      ctx.stroke()
    }
  }
  const SEEDS = 220
  const missing = random() * Math.PI * 2, gap = 0.4 + random() * 0.8
  for (let s = 0; s < SEEDS; s++) {
    const a = random() * Math.PI * 2
    const d = Math.abs(((a - missing + Math.PI * 3) % (Math.PI * 2)) - Math.PI)
    if (d < gap) continue
    const z = random() * 2 - 1
    const rr = R * Math.sqrt(1 - z * z * 0.5)
    const ex = cx + Math.cos(a) * rr, ey = cy + Math.sin(a) * rr * 0.95
    ctx.strokeStyle = `rgba(225,255,235,${0.18 + (z + 1) * 0.15})`
    ctx.lineWidth = 0.6
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(ex, ey)
    ctx.stroke()
    tuft(ex, ey, R * 0.13, 0.3 + (z + 1) * 0.2, a)
  }
  glowDot(ctx, cx, cy, R * 0.07, R * 0.08, TINT.green, 0.8)
  const DRIFT = 10 + Math.floor(random() * 10)
  for (let d = 0; d < DRIFT; d++) {
    const t = random()
    const x = cx + Math.cos(missing) * R * (1.2 + t * 4) + (random() - 0.5) * w * 0.25
    const y = cy + Math.sin(missing) * R * (1.2 + t * 4) - t * h * 0.3 + (random() - 0.5) * h * 0.1
    ctx.strokeStyle = 'rgba(225,255,235,0.55)'
    ctx.lineWidth = 0.7
    const ang = -Math.PI / 2 + (random() - 0.5) * 0.6
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x - Math.cos(ang) * R * 0.15, y - Math.sin(ang) * R * 0.15)
    ctx.stroke()
    tuft(x, y, R * 0.1, 0.55, ang)
  }
}

function drawGalaxy(ctx, w, h, random) {
  ctx.fillStyle = '#010302'
  ctx.fillRect(0, 0, w, h)
  const view = random()
  starfield(ctx, w, h, random, view >= 0.75 ? 0.7 : 1)
  if (view < 0.3) galaxyAt(ctx, w * (0.2 + random() * 0.6), h * (0.3 + random() * 0.5), w * (1.2 + random() * 1.4), 3.2, random, {})
  else if (view < 0.55) {
    galaxyAt(ctx, w * (0.3 + random() * 0.4), h * (0.55 + random() * 0.2), w * (0.5 + random() * 0.3), 1.2, random, {})
    if (random() < 0.6) galaxyAt(ctx, w * random(), h * (0.05 + random() * 0.2), w * 0.1, 0.12, random, {})
  } else if (view < 0.75) galaxyAt(ctx, w / 2, h * (0.55 + random() * 0.2), w * (0.7 + random() * 0.6), 1.6, random, { tilt: 0.06 + random() * 0.08 })
  else {
    const COUNT = 14 + Math.floor(random() * 18)
    for (let g = 0; g < COUNT; g++) galaxyAt(ctx, random() * w, random() * h, w * (0.02 + Math.pow(random(), 3) * 0.16), 0.04 + random() * 0.08, random, { elliptical: random() < 0.35 })
  }
}

function galaxyAt(ctx, gx, gy, size, density, random, opts) {
  const arms = opts.elliptical ? 0 : 2 + Math.floor(random() * 3)
  const twist = 2.5 + random() * 3.5
  const tilt = opts.tilt !== undefined ? opts.tilt : 0.25 + random() * 0.75
  const rot = random() * Math.PI * 2
  const cos = Math.cos(rot), sin = Math.sin(rot)
  ctx.globalCompositeOperation = 'lighter'
  glowDot(ctx, gx, gy, size * 0.05, size * (opts.elliptical ? 0.5 : 0.3), TINT.mint, opts.elliptical ? 0.35 : 0.45)
  glowDot(ctx, gx, gy, size * 0.015, size * 0.07, TINT.white, 0.85)
  const COUNT = Math.round(26000 * density)
  const dotSize = Math.max(1, size / 700)
  for (let n = 0; n < COUNT; n++) {
    const t = Math.pow(random(), 0.75)
    let x, y
    if (arms === 0) {
      const a = random() * Math.PI * 2, r = t * size * 0.6 * (random() + random()) / 2
      x = Math.cos(a) * r; y = Math.sin(a) * r * tilt
    } else {
      const arm = Math.floor(random() * arms)
      const spread = (random() + random() + random() - 1.5) * (0.4 - t * 0.2)
      const ang = arm * (Math.PI * 2 / arms) + t * twist + spread
      x = Math.cos(ang) * t * size; y = Math.sin(ang) * t * size * tilt
    }
    const px = gx + x * cos - y * sin, py = gy + x * sin + y * cos
    if (px < -5 || py < -5 || px > ctx.canvas.width + 5 || py > ctx.canvas.height + 5) continue
    const b = (1 - t) * 0.45 + 0.08
    const pick = random()
    ctx.fillStyle = pick < 0.25 ? `rgba(31,209,168,${b})` : pick < 0.55 ? `rgba(225,255,235,${b})` : `rgba(51,255,102,${b})`
    ctx.fillRect(px, py, dotSize, dotSize)
  }
  if (arms > 0) for (let n = 0; n < 60 * density; n++) {
    const t = random()
    const ang = Math.floor(random() * arms) * (Math.PI * 2 / arms) + t * twist
    const x = Math.cos(ang) * t * size, y = Math.sin(ang) * t * size * tilt
    glowDot(ctx, gx + x * cos - y * sin, gy + x * sin + y * cos, size * 0.004, size * 0.02, TINT.teal, 0.25)
  }
  ctx.globalCompositeOperation = 'source-over'
}

function starfield(ctx, w, h, random, amount) {
  const TINTS = ['157,255,187', '225,255,235', '31,209,168', '51,255,102']
  const k = amount || 1
  ctx.globalCompositeOperation = 'lighter'
  for (let n = 0; n < 3200 * k; n++) {
    const b = random()
    ctx.globalAlpha = 0.12 + b * b * 0.6
    ctx.fillStyle = `rgb(${TINTS[Math.floor(random() * TINTS.length)]})`
    ctx.fillRect(random() * w, random() * h, b > 0.92 ? 1.4 : 0.9, b > 0.92 ? 1.4 : 0.9)
  }
  ctx.globalAlpha = 1
  for (let n = 0; n < 160 * k; n++) {
    const r = 0.5 + Math.pow(random(), 2) * 1.6
    glowDot(ctx, random() * w, random() * h, r, r * (1.5 + random() * 3), TINTS[Math.floor(random() * TINTS.length)], 0.45 + random() * 0.5)
  }
  for (let n = 0; n < 10 * k; n++) {
    const x = random() * w, y = random() * h, r = 1.2 + random() * 1.4
    glowDot(ctx, x, y, r, r * 6, '225,255,235', 0.85)
    ctx.strokeStyle = 'rgba(157,255,187,0.3)'
    ctx.lineWidth = 0.7
    ctx.beginPath()
    ctx.moveTo(x - r * 8, y); ctx.lineTo(x + r * 8, y)
    ctx.moveTo(x, y - r * 8); ctx.lineTo(x, y + r * 8)
    ctx.stroke()
  }
  ctx.globalCompositeOperation = 'source-over'
}

function drawMountains(ctx, w, h, random) {
  const noise = valueNoise(random)
  const sky = ctx.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, '#2f7a4c')
  sky.addColorStop(0.45, '#5fae7c')
  sky.addColorStop(0.62, '#8fd1a5')
  sky.addColorStop(1, '#1d4a2e')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h)
  const LAYERS = 5 + Math.floor(random() * 3)
  const top = h * (0.4 + random() * 0.1)
  const sunX = w * (0.2 + random() * 0.6)
  const sunY = h * (0.07 + random() * 0.13)
  const sunR = w * (0.07 + random() * 0.05)
  glowDot(ctx, sunX, sunY, sunR * 1.2, sunR * 4.5, '157,255,187', 0.22)
  glowDot(ctx, sunX, sunY, sunR, sunR * 1.6, '200,255,215', 0.5)
  ctx.fillStyle = '#e4ffeb'
  ctx.beginPath(); ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2); ctx.fill()
  for (let l = 1; l < LAYERS; l++) {
    const t = l / (LAYERS - 1)
    const base = top + t * h * 0.42
    const amp = h * (0.2 - t * 0.12)
    const freq = 1.2 + l * 0.6 + random() * 0.8
    const shade = Math.round(96 - t * 80)
    ctx.fillStyle = `rgb(${Math.round(shade * 0.3)},${shade},${Math.round(shade * 0.55)})`
    ctx.beginPath()
    ctx.moveTo(-4, h)
    for (let x = -4; x <= w + 4; x += 3) {
      const n = noise(x / w * freq + l * 17, l * 3.3)
      const ridge = 1 - Math.abs(n - 0.5) * 2
      const soft = noise(x / w * freq * 3 + l * 5, l * 9) * 0.08
      ctx.lineTo(x, base - Math.pow(ridge, 1.4) * amp - soft * amp)
    }
    ctx.lineTo(w + 4, h)
    ctx.fill()
    const haze = ctx.createLinearGradient(0, base - amp, 0, base + h * 0.08)
    haze.addColorStop(0, 'rgba(90,180,120,0)')
    haze.addColorStop(1, `rgba(90,180,120,${0.14 * (1 - t)})`)
    ctx.fillStyle = haze
    ctx.fillRect(0, base - amp, w, amp + h * 0.08)
  }
}

function drawWaves(ctx, w, h, random) {
  const horizon = h * (0.42 + random() * 0.1)
  const sky = ctx.createLinearGradient(0, 0, 0, horizon)
  sky.addColorStop(0, '#010302')
  sky.addColorStop(1, '#0c2818')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, horizon)
  for (let n = 0; n < 160; n++) {
    ctx.globalAlpha = 0.15 + random() * 0.5
    ctx.fillStyle = '#9dffbb'
    ctx.fillRect(random() * w, random() * horizon * 0.9, 1, 1)
  }
  ctx.globalAlpha = 1
  const moonX = w * (0.25 + random() * 0.5)
  glowDot(ctx, moonX, horizon * (0.3 + random() * 0.3), w * 0.05, w * 0.12, TINT.mint, 0.75)
  const sea = ctx.createLinearGradient(0, horizon, 0, h)
  sea.addColorStop(0, '#071a10')
  sea.addColorStop(1, '#010403')
  ctx.fillStyle = sea
  ctx.fillRect(0, horizon, w, h - horizon)
  const ROWS = 22
  for (let r = 0; r < ROWS; r++) {
    const t = r / ROWS
    const y = horizon + Math.pow(t, 1.7) * (h - horizon) + 4
    const amp = 1 + t * 10
    const freq = (0.01 + random() * 0.01) / (0.3 + t)
    const phase = random() * 10
    ctx.beginPath()
    for (let x = 0; x <= w; x += 4) {
      const yy = y + Math.sin(x * freq + phase) * amp
      if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy)
    }
    const g = ctx.createLinearGradient(0, 0, w, 0)
    const c = moonX / w, halo = 0.05 + t * 0.15, base = 0.05 + t * 0.06
    g.addColorStop(0, `rgba(51,255,102,${base * 0.5})`)
    g.addColorStop(Math.max(0, c - halo), `rgba(51,255,102,${base})`)
    g.addColorStop(c, `rgba(200,255,220,${0.5 - t * 0.2})`)
    g.addColorStop(Math.min(1, c + halo), `rgba(51,255,102,${base})`)
    g.addColorStop(1, `rgba(51,255,102,${base * 0.5})`)
    ctx.strokeStyle = g
    ctx.lineWidth = 0.8 + t * 1.6
    ctx.stroke()
  }
}

function drawChristmasFarm(ctx, w, h, random) {
  drawEvergreenRows(ctx, w, h, random)
  const roll = random()
  const forced = null
  const mode = forced || (roll < 0.15 ? (random() < 0.12 ? 'near' : 'far') : 'none')
  if (mode === 'none') return
  const near = mode === 'near'
  const s = near ? w * (0.065 + random() * 0.03) : w * (0.016 + random() * 0.024)
  const x = near ? w * (0.15 + random() * 0.45) : w * (0.1 + random() * 0.65)
  const y = near ? h * (0.06 + random() * 0.2) : h * (0.04 + random() * 0.4)
  sleigh(ctx, x, y, s, random() < 0.5, random)
}

function drawEvergreenRows(ctx, w, h, random) {
  const sky = ctx.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, '#010302')
  sky.addColorStop(0.55, '#0c2617')
  sky.addColorStop(1, '#020504')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h)
  for (let n = 0; n < 260; n++) {
    ctx.globalAlpha = 0.15 + random() * 0.6
    ctx.fillStyle = '#9dffbb'
    ctx.fillRect(random() * w, random() * h * 0.55, 1, 1)
  }
  ctx.globalAlpha = 1
  glowDot(ctx, w * (0.15 + random() * 0.7), h * (0.1 + random() * 0.12), w * 0.045, w * 0.1, TINT.mint, 0.7)
  const SNOW = '214,255,224'
  const horizon = h * (0.55 + random() * 0.06)
  const tree = (x, base, height, shade) => {
    const width = height * (0.42 + random() * 0.1)
    const tiers = 4 + Math.floor(random() * 3)
    const body = `rgb(${Math.round(shade * 0.3)},${Math.round(shade)},${Math.round(shade * 0.55)})`
    ctx.fillStyle = body
    ctx.fillRect(x - height * 0.025, base - height * 0.1, height * 0.05, height * 0.1)
    for (let t = 0; t < tiers; t++) {
      const k = t / tiers
      const ty = base - height * 0.08 - k * height * 0.85
      const tw = width * (1 - k * 0.8) / 2
      const th = height * 0.3
      ctx.fillStyle = body
      ctx.beginPath()
      ctx.moveTo(x - tw, ty)
      ctx.quadraticCurveTo(x - tw * 0.4, ty - th * 0.4, x, ty - th)
      ctx.quadraticCurveTo(x + tw * 0.4, ty - th * 0.4, x + tw, ty)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = `rgba(${SNOW},0.6)`
      ctx.beginPath()
      ctx.moveTo(x - tw * 0.9, ty - 1)
      ctx.quadraticCurveTo(x, ty - th * 0.25, x + tw * 0.9, ty - 1)
      ctx.quadraticCurveTo(x, ty - th * 0.12, x - tw * 0.9, ty - 1)
      ctx.fill()
    }
  }
  const ROWS = 9
  for (let r = 0; r < ROWS; r++) {
    const t = r / (ROWS - 1)
    const base = horizon + Math.pow(t, 1.6) * (h - horizon) * 1.05
    const height = h * (0.035 + t * t * 0.3)
    const spacing = height * (0.55 + random() * 0.15)
    const shade = 14 + t * 38
    let x = -random() * spacing
    while (x < w + spacing) {
      tree(x + (random() - 0.5) * spacing * 0.2, base, height * (0.85 + random() * 0.3), shade)
      x += spacing
    }
  }
  for (let n = 0; n < 180; n++) {
    ctx.globalAlpha = 0.3 + random() * 0.5
    ctx.fillStyle = `rgb(${SNOW})`
    ctx.beginPath()
    ctx.arc(random() * w, random() * h, 0.6 + random() * 1.6, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

function sleigh(ctx, x, y, s, flip, random) {
  ctx.save()
  ctx.translate(x, y)
  if (flip) ctx.scale(-1, 1)
  ctx.rotate(-0.08)
  const ink = 'rgba(214,255,224,0.85)'
  ctx.fillStyle = ink
  ctx.strokeStyle = ink
  ctx.lineCap = 'round'
  ctx.lineWidth = s * 0.05
  ctx.beginPath()
  ctx.moveTo(-s * 1.1, s * 0.25)
  ctx.lineTo(s * 0.1, s * 0.25)
  ctx.quadraticCurveTo(s * 0.35, s * 0.25, s * 0.35, 0)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(-s * 1.0, s * 0.18)
  ctx.lineTo(-s * 1.05, -s * 0.25)
  ctx.quadraticCurveTo(-s * 0.95, -s * 0.15, -s * 0.7, -s * 0.12)
  ctx.lineTo(-s * 0.2, -s * 0.12)
  ctx.quadraticCurveTo(0, -s * 0.12, s * 0.05, s * 0.18)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath(); ctx.ellipse(-s * 0.55, -s * 0.28, s * 0.17, s * 0.2, 0, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(-s * 0.5, -s * 0.55, s * 0.09, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.moveTo(-s * 0.6, -s * 0.6); ctx.lineTo(-s * 0.42, -s * 0.62); ctx.lineTo(-s * 0.62, -s * 0.82); ctx.closePath(); ctx.fill()
  ctx.beginPath(); ctx.ellipse(-s * 0.85, -s * 0.3, s * 0.13, s * 0.15, 0.3, 0, Math.PI * 2); ctx.fill()
  const REINDEER = 6
  let lead = null
  ctx.lineWidth = s * 0.025
  ctx.beginPath()
  ctx.moveTo(0, -s * 0.05)
  ctx.lineTo(s * (0.6 + REINDEER * 0.55), -s * 0.32)
  ctx.stroke()
  for (let r = 0; r < REINDEER; r++) {
    const rx = s * (0.75 + r * 0.55), ry = -s * 0.15 - r * s * 0.04 + (r % 2) * s * 0.05
    const bs = s * 0.22
    ctx.beginPath(); ctx.ellipse(rx, ry, bs * 0.95, bs * 0.38, -0.1, 0, Math.PI * 2); ctx.fill()
    ctx.lineWidth = s * 0.04
    ctx.beginPath(); ctx.moveTo(rx + bs * 0.8, ry - bs * 0.15); ctx.lineTo(rx + bs * 1.15, ry - bs * 0.75); ctx.stroke()
    ctx.beginPath(); ctx.ellipse(rx + bs * 1.3, ry - bs * 0.8, bs * 0.28, bs * 0.16, -0.25, 0, Math.PI * 2); ctx.fill()
    ctx.lineWidth = s * 0.02
    ctx.beginPath()
    ctx.moveTo(rx + bs * 1.15, ry - bs * 0.95); ctx.lineTo(rx + bs * 1.0, ry - bs * 1.45); ctx.lineTo(rx + bs * 0.8, ry - bs * 1.6)
    ctx.moveTo(rx + bs * 1.05, ry - bs * 1.25); ctx.lineTo(rx + bs * 1.25, ry - bs * 1.5)
    ctx.stroke()
    ctx.lineWidth = s * 0.03
    ctx.beginPath()
    ctx.moveTo(rx + bs * 0.6, ry + bs * 0.2); ctx.lineTo(rx + bs * 1.1, ry + bs * 0.45)
    ctx.moveTo(rx + bs * 0.4, ry + bs * 0.25); ctx.lineTo(rx + bs * 0.75, ry + bs * 0.7)
    ctx.moveTo(rx - bs * 0.6, ry + bs * 0.2); ctx.lineTo(rx - bs * 1.05, ry + bs * 0.5)
    ctx.moveTo(rx - bs * 0.45, ry + bs * 0.25); ctx.lineTo(rx - bs * 0.7, ry + bs * 0.75)
    ctx.stroke()
    lead = [rx + bs * 1.56, ry - bs * 0.84]
  }
  const m = ctx.getTransform()
  ctx.restore()
  const p = new DOMPoint(lead[0], lead[1]).matrixTransform(m)
  const r = Math.max(0.6, s * 0.018)
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3.2)
  g.addColorStop(0, 'rgba(255,90,80,0.95)')
  g.addColorStop(0.35, 'rgba(255,60,50,0.55)')
  g.addColorStop(1, 'rgba(255,40,40,0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(p.x, p.y, r * 3.2, 0, Math.PI * 2)
  ctx.fill()
}

function drawCity(ctx, w, h, random) {
  const road = drawCityScene(ctx, w, h, random)
  if (random() > 0.12) return
  if (!road) return
  const COUNT = 1 + (random() < 0.4 ? 1 : 0)
  for (let c = 0; c < COUNT; c++) {
    const s = w * (0.02 + random() * 0.018)
    const high = random() < 0.3
    const y = high ? road.lampTop - h * (0.025 + random() * 0.06) : road.lampTop + (road.roadY - road.lampTop) * (0.35 + random() * 0.45)
    hoverCar(ctx, w * (0.15 + random() * 0.7), y, s, random() < 0.5 ? 1 : -1, random)
  }
}

function drawCityScene(ctx, w, h, random) {
  const forced = null
  const sky = ctx.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, '#010302')
  sky.addColorStop(0.62, '#0c2a17')
  sky.addColorStop(1, '#020504')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h)
  for (let n = 0; n < 200; n++) {
    ctx.globalAlpha = 0.15 + random() * 0.5
    ctx.fillStyle = '#9dffbb'
    ctx.fillRect(random() * w, random() * h * 0.5, 1, 1)
  }
  ctx.globalAlpha = 1
  let road = null
  const ground = (random() < 0.45 ? 'river' : random() < 0.75 ? 'street' : 'haze')
  const horizon = ground === 'river' ? h * (0.66 + random() * 0.06) : h * (0.78 + random() * 0.08)
  if (forced === 'moon' || (!forced && random() < 0.1)) pixelMoon(ctx, w * (0.2 + random() * 0.6), horizon - h * (0.3 + random() * 0.15), w * (0.13 + random() * 0.1), random)
  const glow = ctx.createLinearGradient(0, horizon - h * 0.35, 0, horizon)
  glow.addColorStop(0, 'rgba(51,255,102,0)')
  glow.addColorStop(1, 'rgba(51,255,102,0.12)')
  ctx.fillStyle = glow
  ctx.fillRect(0, horizon - h * 0.35, w, h * 0.35)
  const LAYERS = 3
  for (let l = 0; l < LAYERS; l++) {
    const shade = [16, 9, 5][l]
    const base = horizon + [-h * 0.01, 0, h * 0.005][l]
    let x = -random() * 20
    while (x < w) {
      const tower = random() < 0.18
      const bw = w * (tower ? 0.06 + random() * 0.05 : 0.05 + random() * 0.09) * (1 + l * 0.25)
      const bh = h * (tower ? 0.3 + random() * 0.2 : 0.06 + random() * 0.18) * (1 - l * 0.12)
      building(ctx, x, bw, base, bh, shade, l, random, l === 2 ? 1 : 0.6)
      x += bw + w * (random() < 0.3 ? 0.01 : 0.002)
    }
    if (l < 2) {
      ctx.fillStyle = `rgba(12,42,23,${0.35 - l * 0.12})`
      ctx.fillRect(0, 0, w, horizon + 4)
    }
  }
  if (ground === 'river') {
    const snap = ctx.getImageData(0, Math.max(0, Math.floor(horizon - (h - horizon))), w, Math.floor(h - horizon))
    const water = ctx.createLinearGradient(0, horizon, 0, h)
    water.addColorStop(0, '#04140b')
    water.addColorStop(1, '#010403')
    ctx.fillStyle = water
    ctx.fillRect(0, horizon, w, h - horizon)
    const c2 = document.createElement('canvas')
    c2.width = w; c2.height = snap.height
    c2.getContext('2d').putImageData(snap, 0, 0)
    for (let y = 0; y < h - horizon; y += 2) {
      const off = Math.sin(y * 0.35 + random() * 0.5) * (1 + y * 0.03)
      ctx.globalAlpha = 0.45 * (1 - y / (h - horizon))
      ctx.drawImage(c2, 0, c2.height - 1 - y, w, 2, off, horizon + y, w, 2)
    }
    ctx.globalAlpha = 1
    ctx.strokeStyle = 'rgba(157,255,187,0.12)'
    ctx.lineWidth = 1
    for (let r = 0; r < 26; r++) {
      const y = horizon + Math.pow(random(), 1.5) * (h - horizon)
      const x0 = random() * w
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + w * (0.05 + random() * 0.2), y); ctx.stroke()
    }
  } else if (ground === 'street') {
    ctx.fillStyle = '#020604'
    ctx.fillRect(0, horizon, w, h - horizon)
    const roadY = horizon + (h - horizon) * (0.3 + random() * 0.3)
    road = { roadY, lampTop: roadY - h * 0.06 }
    for (let lane = 0; lane < 2; lane++) {
      const y = roadY + lane * h * 0.02
      for (let t = 0; t < 10 + Math.floor(random() * 10); t++) {
        const x0 = random() * w, len = w * (0.15 + random() * 0.45)
        const g = ctx.createLinearGradient(x0, 0, x0 + len, 0)
        const col = lane === 0 ? '200,255,215' : '31,209,168'
        g.addColorStop(0, `rgba(${col},0)`)
        g.addColorStop(0.5, `rgba(${col},${0.25 + random() * 0.35})`)
        g.addColorStop(1, `rgba(${col},0)`)
        ctx.fillStyle = g
        ctx.fillRect(x0, y + (random() - 0.5) * 3, len, 1.5 + random() * 1.5)
      }
    }
    const LAMPS = 6 + Math.floor(random() * 5)
    for (let p = 0; p < LAMPS; p++) {
      const x = (p + 0.5) * w / LAMPS
      ctx.fillStyle = '#04100a'
      ctx.fillRect(x - 1, roadY - h * 0.06, 2, h * 0.06)
      glowDot(ctx, x, roadY - h * 0.06, 1.5, 10, '157,255,187', 0.7)
    }
  } else {
    const haze = ctx.createLinearGradient(0, horizon - h * 0.05, 0, h)
    haze.addColorStop(0, 'rgba(60,140,90,0.0)')
    haze.addColorStop(0.3, 'rgba(60,140,90,0.18)')
    haze.addColorStop(1, 'rgba(10,30,18,0.9)')
    ctx.fillStyle = haze
    ctx.fillRect(0, horizon - h * 0.05, w, h)
  }
  return road
}

function building(ctx, x, w0, base, height, shade, layer, random, glowLevel) {
  const top = base - height
  const body = `rgb(${Math.round(shade * 0.35)},${Math.round(shade * 1.15)},${Math.round(shade * 0.7)})`
  ctx.fillStyle = body
  const style = random()
  ctx.fillRect(x, top, w0, height + 2)
  let roofTop = top
  if (style < 0.25) {
    const steps = 1 + Math.floor(random() * 3)
    let sw = w0, sx = x, sy = top
    for (let s = 0; s < steps; s++) {
      sw *= 0.6 + random() * 0.2
      sx = x + (w0 - sw) / 2
      const sh = height * (0.05 + random() * 0.08)
      sy -= sh
      ctx.fillRect(sx, sy, sw, sh + 1)
    }
    roofTop = sy
    if (random() < 0.6) { ctx.fillRect(x + w0 / 2 - 1, sy - height * 0.12, 2, height * 0.12); roofTop = sy - height * 0.12 }
  } else if (style < 0.38) {
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x + w0 / 2, top - w0 * (0.6 + random() * 0.9)); ctx.lineTo(x + w0, top); ctx.fill()
    roofTop = top - w0
  } else if (style < 0.5) {
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x + w0, top - w0 * (0.2 + random() * 0.4)); ctx.lineTo(x + w0, top); ctx.fill()
  } else if (style < 0.62) {
    ctx.fillRect(x + w0 * 0.3, top - height * 0.08, w0 * 0.4, height * 0.08)
    ctx.fillRect(x + w0 / 2 - 0.8, top - height * 0.2, 1.6, height * 0.12)
    roofTop = top - height * 0.2
  }
  if (roofTop < top - 4 && random() < 0.7) glowDot(ctx, x + w0 / 2, roofTop, 1, 3, '157,255,187', 0.8)
  if (layer === 0) return
  const dark = random() < 0.12
  if (dark) return
  const cols = Math.max(2, Math.floor(w0 / (layer === 2 ? 7 : 5)))
  const winW = (w0 / cols) * 0.5
  const floorH = layer === 2 ? 9 : 6
  const lit = 0.25 + random() * 0.45
  const tone = random() < 0.3 ? '31,209,168' : random() < 0.5 ? '200,255,215' : '51,255,102'
  for (let fy = top + floorH; fy < base - floorH; fy += floorH) {
    const floorOn = random() < lit
    for (let c = 0; c < cols; c++) {
      const on = floorOn ? random() < 0.85 : random() < 0.08
      if (!on) continue
      ctx.fillStyle = `rgba(${tone},${(0.35 + random() * 0.45) * glowLevel})`
      ctx.fillRect(x + (c + 0.25) * (w0 / cols), fy, winW, floorH * 0.5)
    }
  }
}

function pixelMoon(ctx, x, y, r, random) {
  glowDot(ctx, x, y, r, r * 0.9, '157,255,187', 0.22)
  const disc = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r)
  disc.addColorStop(0, '#d9f7e2')
  disc.addColorStop(1, '#9cc9ab')
  ctx.fillStyle = disc
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  const CELL = Math.max(2, Math.round(r / 22))
  const cells = new Map()
  const put = (cx, cy, color) => {
    const gx = Math.floor(cx / CELL), gy = Math.floor(cy / CELL)
    const px = gx * CELL + CELL / 2, py = gy * CELL + CELL / 2
    if ((px - x) * (px - x) + (py - y) * (py - y) > (r - CELL * 0.6) * (r - CELL * 0.6)) return
    cells.set(gx + ',' + gy, color)
  }
  const blob = (bx, by, rx, ry, color) => {
    for (let yy = by - ry; yy <= by + ry; yy += CELL) for (let xx = bx - rx; xx <= bx + rx; xx += CELL) {
      const d = ((xx - bx) / rx) ** 2 + ((yy - by) / ry) ** 2
      if (d <= 1 + (random() - 0.5) * 0.25) put(xx, yy, color)
    }
  }
  for (let m = 0; m < 3 + Math.floor(random() * 3); m++) blob(x + (random() - 0.5) * r * 1.1, y + (random() - 0.5) * r * 1.1, r * (0.18 + random() * 0.22), r * (0.14 + random() * 0.2), 'rgba(110,150,125,0.55)')
  const CRATERS = 12 + Math.floor(random() * 12)
  const rims = []
  for (let c = 0; c < CRATERS; c++) {
    const a = random() * Math.PI * 2, d = Math.sqrt(random()) * r * 0.85
    const cx = x + Math.cos(a) * d, cy = y + Math.sin(a) * d
    const cr = r * (0.04 + Math.pow(random(), 2) * 0.13)
    blob(cx, cy, cr, cr, 'rgba(78,118,95,0.75)')
    rims.push([cx, cy, cr])
  }
  for (const [cx, cy, cr] of rims) {
    for (let a = Math.PI * 0.05; a < Math.PI * 0.95; a += CELL / (cr + 1) * 0.9) put(cx + Math.cos(a) * (cr + CELL * 0.5), cy + Math.sin(a) * (cr + CELL * 0.5), 'rgba(240,255,245,0.8)')
    for (let a = Math.PI * 1.05; a < Math.PI * 1.95; a += CELL / (cr + 1) * 0.9) put(cx + Math.cos(a) * cr * 0.85, cy + Math.sin(a) * cr * 0.85, 'rgba(50,85,65,0.85)')
  }
  for (const [key, color] of cells) {
    const [gx, gy] = key.split(',').map(Number)
    ctx.fillStyle = color
    ctx.fillRect(gx * CELL, gy * CELL, CELL, CELL)
  }
}

function hoverCar(ctx, x, y, s, dir, random) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(dir, 1)
  const trail = ctx.createLinearGradient(-s * 9, 0, -s * 0.8, 0)
  trail.addColorStop(0, 'rgba(31,209,168,0)')
  trail.addColorStop(1, 'rgba(31,209,168,0.55)')
  ctx.fillStyle = trail
  ctx.fillRect(-s * 9, -s * 0.18, s * 8.2, s * 0.22)
  const under = ctx.createRadialGradient(0, s * 0.35, 0, 0, s * 0.35, s * 1.4)
  under.addColorStop(0, 'rgba(51,255,102,0.55)')
  under.addColorStop(1, 'rgba(51,255,102,0)')
  ctx.fillStyle = under
  ctx.beginPath(); ctx.ellipse(0, s * 0.4, s * 1.4, s * 0.35, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#0b2015'
  ctx.strokeStyle = 'rgba(157,255,187,0.85)'
  ctx.lineWidth = Math.max(1, s * 0.06)
  ctx.beginPath()
  ctx.moveTo(-s * 1.1, s * 0.15)
  ctx.lineTo(-s * 0.95, -s * 0.2)
  ctx.quadraticCurveTo(-s * 0.4, -s * 0.62, s * 0.25, -s * 0.55)
  ctx.quadraticCurveTo(s * 0.8, -s * 0.4, s * 1.15, -s * 0.05)
  ctx.lineTo(s * 1.1, s * 0.15)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = 'rgba(157,255,187,0.35)'
  ctx.beginPath()
  ctx.moveTo(-s * 0.45, -s * 0.28)
  ctx.quadraticCurveTo(-s * 0.15, -s * 0.52, s * 0.3, -s * 0.47)
  ctx.lineTo(s * 0.55, -s * 0.25)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
  glowDot(ctx, x + dir * s * 1.12, y - s * 0.02, Math.max(1, s * 0.07), s * 0.5, '225,255,235', 0.95)
}

function drawFractal(ctx, w, h, random, forceMandel) {
  const TYPES = ['mandel', 'mandel', 'mandel', 'cubic']
  const MODES = ['bands', 'glow', 'edge']
  const classic = random() < 0.18
  let type = classic || forceMandel ? 'mandel' : TYPES[Math.floor(random() * TYPES.length)]
  const mode = classic ? 'edge' : MODES[Math.floor(random() * MODES.length)]
  const aspect = h / w
  const GX = 18, GY = Math.round(18 * aspect)
  const score = (cx, cy, span, iter) => {
    const vals = []
    for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) vals.push(fractalStep(type, cx + ((i + 0.5) / GX - 0.5) * span, cy + ((j + 0.5) / GY - 0.5) * span * aspect, iter, 256))
    let inside = 0, busy = 0, total = 0
    const lv = (v) => v < 0 ? -1 : Math.log(v + 1)
    for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) {
      const v = vals[j * GX + i]
      if (v < 0) inside++
      total++
      let d = 0
      for (const [di, dj] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const ii = i + di, jj = j + dj
        if (ii < 0 || jj < 0 || ii >= GX || jj >= GY) continue
        const u = vals[jj * GX + ii]
        if ((u < 0) !== (v < 0)) d = 1
        else if (u >= 0 && Math.abs(lv(u) - lv(v)) > 0.12) d = 1
      }
      busy += d
    }
    return { inside: inside / total, busy: busy / total }
  }
  let best = null
  let cx = -0.6, cy = 0, span = 3.2, iter = 220
  if (classic) {
    cx = -0.75 + (random() - 0.5) * 0.2
    cy = (random() - 0.5) * 0.15
    span = 2.7 + random() * 0.4
    iter = 260
  } else {
    for (let attempt = 0; attempt < 120; attempt++) {
      let px = 0, py = 0, found = false
      for (let t = 0; t < 2000 && !found; t++) {
        px = -2.2 + random() * 3
        py = (random() - 0.5) * 2.6
        const v = fractalStep(type, px, py, 500, 16)
        if (v > 30) found = true
      }
      if (!found) continue
      const sp = Math.pow(10, -(0.4 + random() * 2.2))
      const it = Math.round(180 + Math.log10(1 / sp) * 80)
      const s = score(px, py, sp, it)
      const bad = (1 - s.busy) + Math.max(0, s.inside - 0.25) * 2
      if (!best || bad < best.bad) best = { bad, px, py, sp, it }
      if (s.busy > 0.75 && s.inside < 0.25) break
    }
    if (best && best.bad > 0.45 && type !== 'mandel') { type = 'mandel'; return drawFractal(ctx, w, h, random, true) }
    if (best) { cx = best.px; cy = best.py; span = best.sp; iter = best.it }
  }
  const tintA = random() < 0.7 ? [51, 255, 102] : [31, 209, 168]
  const tintB = [157, 255, 187]
  const cycle = classic ? 3 + random() * 3 : 10 + random() * 30
  const phase = random() * Math.PI * 2
  const img = ctx.createImageData(w, h)
  const scale = classic ? span / h : span / w
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const v = classic ? fractalStep(type, cx - (py - h / 2) * scale, cy + (px - w / 2) * scale, iter, 256) : fractalStep(type, cx + (px - w / 2) * scale, cy + (py - h / 2) * scale, iter, 256)
      const p = (py * w + px) * 4
      let k = 0, mix = 0
      if (v < 0) k = 0
      else if (mode === 'bands') { k = Math.pow(0.5 + 0.5 * Math.sin(v / cycle * Math.PI * 2 + phase), 2.2); mix = k }
      else if (mode === 'glow') { k = Math.min(1, Math.pow(v / iter, 0.45) * 1.15); mix = k * k }
      else if (classic) { k = Math.min(1, Math.pow(v / 40, 0.9) + 0.04); mix = k * k }
      else { k = Math.min(1, Math.pow(v / (iter * 0.5), 1.6) + 0.06); mix = k }
      img.data[p] = Math.round(3 + k * (tintA[0] * (1 - mix) + tintB[0] * mix) * 0.9)
      img.data[p + 1] = Math.round(8 + k * (tintA[1] * (1 - mix) + tintB[1] * mix) * 0.95)
      img.data[p + 2] = Math.round(6 + k * (tintA[2] * (1 - mix) + tintB[2] * mix) * 0.9)
      img.data[p + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
}

function fractalStep(type, cx, cy, iter, bail) {
  let x = 0, y = 0, i = 0
  while (i < iter && x * x + y * y < bail) {
    let nx, ny
    if (type === 'ship') { const ax = Math.abs(x), ay = Math.abs(y); nx = ax * ax - ay * ay + cx; ny = 2 * ax * ay + cy }
    else if (type === 'tricorn') { nx = x * x - y * y + cx; ny = -2 * x * y + cy }
    else if (type === 'cubic') { nx = x * x * x - 3 * x * y * y + cx; ny = 3 * x * x * y - y * y * y + cy }
    else { nx = x * x - y * y + cx; ny = 2 * x * y + cy }
    x = nx; y = ny; i++
  }
  if (i === iter) return -1
  const power = type === 'cubic' ? 3 : 2
  return i + 1 - Math.log(Math.log(x * x + y * y) / 2) / Math.log(power)
}

function drawBranchLogo(ctx, w, h, random) {
  ctx.fillStyle = '#010302'
  ctx.fillRect(0, 0, w, h)
  const glow = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.6)
  glow.addColorStop(0, 'rgba(20,60,35,0.5)')
  glow.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, w, h)
  const INK = [201, 245, 214]
  const segs = []
  const mass = []
  const stacked = false
  const jitter = 0.09 + random() * 0.09
  const strands = 3 + Math.floor(random() * 3)
  const thornRate = 0.12 + random() * 0.14
  const weight = 1.6 + random() * 2.2
  const reach = h * (0.14 + random() * 0.16)
  const thorn = (out, x, y, ang, len, thick, depth, pull) => {
    if (depth === 0 || thick < 0.25 || len < 1.5) return
    let cx = x, cy = y
    const steps = 3 + Math.floor(random() * 4)
    for (let s = 0; s < steps; s++) {
      ang += (random() - 0.5) * 0.75
      if (pull !== undefined) ang += (pull - ang) * 0.12
      const nx = cx + Math.cos(ang) * len / steps, ny = cy + Math.sin(ang) * len / steps
      out.push([cx, cy, nx, ny, Math.max(0.25, thick * (1 - (s + 1) / steps * 0.7))])
      cx = nx; cy = ny
      if (random() < 0.3) thorn(out, cx, cy, ang + (random() < 0.5 ? -1 : 1) * (0.4 + random() * 0.9), len * 0.42, thick * 0.5, depth - 1, pull)
    }
    if (random() < 0.6) for (let k = 0; k < 2; k++) thorn(out, cx, cy, ang + (k - 0.5) * (0.4 + random() * 0.6), len * (0.6 + random() * 0.2), thick * 0.6, depth - 1, pull)
  }
  const GL = GLYPHS
  const bounds = { x0: w, x1: 0, y0: h, y1: 0 }
  const tips = []
  const strokeAlong = (pts, size, ox, oy, cellW) => {
    const map = ([u, v]) => [ox + u * cellW, oy + v * size]
    const segCount = pts.length - 1
    for (let strand = 0; strand < strands; strand++) {
      const phase = random() * 10
      const peak = strand === 0 ? 1.25 : 0.45 + random() * 0.45
      let prev = null
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, ay] = map(pts[i]), [bx, by] = map(pts[i + 1])
        const len = Math.hypot(bx - ax, by - ay)
        const steps = Math.max(2, Math.round(len / 4))
        const nx = -(by - ay) / len, ny = (bx - ax) / len
        for (let s = 0; s <= steps; s++) {
          const t = s / steps
          const wob = (Math.sin((i + t) * 6 + phase) * 0.6 + (random() - 0.5) * 1.2) * size * jitter
          const px = ax + (bx - ax) * t + nx * wob, py = ay + (by - ay) * t + ny * wob
          bounds.x0 = Math.min(bounds.x0, px); bounds.x1 = Math.max(bounds.x1, px)
          bounds.y0 = Math.min(bounds.y0, py); bounds.y1 = Math.max(bounds.y1, py)
          const progress = (i + t) / segCount
          const taper = 0.25 + Math.sin(Math.PI * progress) * 0.85 + (random() - 0.5) * 0.2
          if (prev) segs.push([prev[0], prev[1], px, py, Math.max(0.3, weight * peak * taper)])
          prev = [px, py]
          if (random() < thornRate) {
            const out = Math.atan2(ny, nx) + (random() < 0.5 ? 0 : Math.PI)
            thorn(random() < 0.5 ? segs : mass, px, py, out + (random() - 0.5) * 0.9, size * (0.1 + random() * 0.5), weight * 0.7, 4)
          }
        }
      }
    }
    tips.push(map(pts[0]), map(pts[pts.length - 1]))
  }
  const word = (text, cx, cy, size) => {
    const cellW = size * 0.6, gap = size * 0.1
    const cw = (ch) => ch === 'I' ? cellW * 0.3 : cellW
    const total = [...text].reduce((t, ch) => t + cw(ch), 0) + (text.length - 1) * gap
    let x = cx - total / 2
    for (const ch of text) {
      const lift = (random() - 0.5) * size * 0.14
      const stretch = 1 + (random() - 0.3) * 0.3
      for (const stroke of GL[ch]) strokeAlong(stroke, size * stretch, x, cy - size * stretch / 2 + lift, cw(ch))
      x += cw(ch) + gap
    }
  }
  if (stacked) {
    const size = Math.min(h * 0.22, w * 0.11)
    word('VALID', w / 2, h * 0.39, size)
    word('VAULT', w / 2, h * 0.63, size)
  } else {
    const size = Math.min(h * 0.26, w * 0.07)
    word('VALID', w / 2 - size * 2.05, h / 2, size)
    word('VAULT', w / 2 + size * 2.05, h / 2, size)
  }
  for (const [tx, ty] of tips) {
    const up = ty < (bounds.y0 + bounds.y1) / 2
    if (random() < 0.85) thorn(segs, tx, ty, (up ? -Math.PI / 2 : Math.PI / 2) + (random() - 0.5) * 0.7, reach * (0.5 + random()), weight * 1.2, 6, up ? -Math.PI / 2 : Math.PI / 2)
  }
  const midX = (bounds.x0 + bounds.x1) / 2
  const midY = (bounds.y0 + bounds.y1) / 2
  const spanX = (bounds.x1 - bounds.x0) / 2
  const SHAPES = [
    { up: 1.3, down: 0.6, center: 1.6, fan: 1, side: 0.8 },
    { up: 0.55, down: 1.4, center: 1.2, fan: 1, side: 0.7 },
    { up: 1.2, down: 1.2, center: 2.6, fan: 0.6, side: 0.4 },
    { up: 0.6, down: 0.6, center: 0.4, fan: 1.5, side: 2.2 },
    { up: 1.5, down: 1.0, center: 1, fan: 0.4, side: 0.5 },
    { up: 1, down: 1, center: 1, fan: 1, side: 1 }
  ]
  const shape = SHAPES[Math.floor(random() * SHAPES.length)]
  const ragged = 0.3 + random() * 0.9
  const bandH = bounds.y1 - bounds.y0
  const MASS = 170 + Math.floor(random() * 170)
  for (let b = 0; b < MASS; b++) {
    const t = random()
    const x = midX - spanX * 1.05 * Math.pow(t, 0.8)
    const up = random() < shape.up / (shape.up + shape.down)
    const startY = bounds.y0 + bandH * (up ? 0.65 - random() * 0.75 : 0.35 + random() * 0.75)
    const dir = up ? -Math.PI / 2 : Math.PI / 2
    const fan = ((1 - t) * 0.25 + t * 1.1) * shape.fan
    const ang = dir - (up ? -1 : 1) * fan * (0.3 + random() * 0.7) * (random() < 0.5 ? 1 : 0.5)
    const centerWeight = Math.pow(1 - t, shape.center) * 0.9 + 0.25
    const len = reach * (0.3 + random() * 1.1) * centerWeight * (up ? shape.up : shape.down) * (1 + (random() - 0.5) * ragged)
    thorn(mass, x + (random() - 0.5) * 8, startY, ang, len, 0.6 + random() * 1.6, 5, dir)
  }
  const FILL = 40 + Math.floor(random() * 40)
  for (let b = 0; b < FILL; b++) {
    const x = bounds.x0 + random() * (bounds.x1 - bounds.x0)
    const y = bounds.y0 + random() * bandH
    const dir = random() < 0.5 ? -Math.PI / 2 : Math.PI / 2
    thorn(mass, x, y, dir + (random() - 0.5) * 1.6, bandH * (0.3 + random() * 0.7), 0.5 + random() * 1.2, 4, dir)
  }
  const LIMBS = 16 + Math.floor(random() * 16)
  for (let b = 0; b < LIMBS; b++) {
    const t = random()
    const up = random() < 0.5
    const x = midX - spanX * Math.pow(t, 0.9)
    const y = up ? bounds.y0 + random() * (bounds.y1 - bounds.y0) * 0.4 : bounds.y1 - random() * (bounds.y1 - bounds.y0) * 0.4
    const dir = up ? -Math.PI / 2 : Math.PI / 2
    thorn(mass, x, y, dir - (up ? -1 : 1) * t * (0.2 + random() * 0.9), reach * (0.7 + random() * 0.9), weight * (1.1 + random() * 0.8), 7, dir)
  }
  const SIDE = Math.round((14 + Math.floor(random() * 18)) * shape.side)
  for (let b = 0; b < SIDE; b++) {
    const y = midY + (random() - 0.5) * (bounds.y1 - bounds.y0) * 0.9
    thorn(mass, bounds.x0 + random() * 14, y, Math.PI + (random() - 0.5) * 1.1, spanX * (0.12 + random() * 0.4) * shape.side, 0.8 + random() * 1.4, 5)
  }
  const symmetric = random() < 0.7
  ctx.lineCap = 'round'
  const drawSegs = (list, mirror, alpha) => {
    for (const [x1, y1, x2, y2, wd] of list) {
      ctx.strokeStyle = `rgba(${INK},${alpha})`
      ctx.lineWidth = wd
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
      if (mirror) { ctx.beginPath(); ctx.moveTo(2 * midX - x1, y1); ctx.lineTo(2 * midX - x2, y2); ctx.stroke() }
    }
  }
  const back = [], front = []
  for (const sgm of mass) (random() < 0.2 ? front : back).push(sgm)
  if (!symmetric) {
    const extra = []
    for (const sgm of mass) if (random() < 0.85) extra.push([2 * midX - sgm[0] + (random() - 0.5) * 30, sgm[1], 2 * midX - sgm[2] + (random() - 0.5) * 30, sgm[3], sgm[4]])
    back.push(...extra.filter(() => random() < 0.8))
  }
  drawSegs(back, symmetric, 0.85)
  drawSegs(segs, false, 0.92)
  drawSegs(front, symmetric, 0.85)
}

const GLYPHS = {
  V: [[[0, 0], [0.5, 1], [1, 0]]],
  A: [[[0, 1], [0.5, 0], [1, 1]], [[0.2, 0.62], [0.8, 0.62]]],
  L: [[[0.1, 0], [0.1, 1], [0.95, 1]]],
  I: [[[0.5, 0], [0.5, 1]]],
  D: [[[0.08, 0], [0.08, 1]], [[0.08, 0], [0.55, 0.06], [0.92, 0.35], [0.92, 0.65], [0.55, 0.94], [0.08, 1]]],
  U: [[[0, 0], [0, 0.68], [0.18, 0.94], [0.5, 1], [0.82, 0.94], [1, 0.68], [1, 0]]],
  T: [[[0, 0], [1, 0]], [[0.5, 0], [0.5, 1]]]
}

function drawOpenWater(ctx, w, h, random) {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#0f5a44')
  g.addColorStop(0.5, '#073426')
  g.addColorStop(1, '#021710')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  ctx.globalCompositeOperation = 'lighter'
  for (let r = 0; r < 8; r++) {
    const x = random() * w
    const ray = ctx.createLinearGradient(x, 0, x + w * 0.15, h * 0.8)
    ray.addColorStop(0, 'rgba(140,255,210,0.07)')
    ray.addColorStop(1, 'rgba(140,255,210,0)')
    ctx.fillStyle = ray
    const wd = w * (0.02 + random() * 0.05)
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + wd, 0); ctx.lineTo(x + wd + w * 0.22, h * 0.8); ctx.lineTo(x + w * 0.22, h * 0.8); ctx.fill()
  }
  ctx.globalCompositeOperation = 'source-over'
  for (let p = 0; p < 160; p++) {
    ctx.fillStyle = `rgba(190,255,225,${0.1 + random() * 0.3})`
    ctx.fillRect(random() * w, random() * h, 1, 1)
  }
  const flow = random() < 0.5 ? 1 : -1
  const far = 3 + Math.floor(random() * 3)
  for (let k = 0; k < far; k++) {
    const cx = random() * w, cy = h * (0.08 + random() * 0.85), n = 15 + Math.floor(random() * 25)
    for (let f = 0; f < n; f++) fishShape(ctx, cx + (random() - 0.5) * w * 0.3, cy + (random() - 0.5) * h * 0.06, w * 0.006, flow, `rgba(110,200,160,${0.2 + random() * 0.2})`, 0)
  }
  const bait = () => {
    const cx = w * (0.1 + random() * 0.8), cy = h * (0.15 + random() * 0.7)
    const rx = w * (0.28 + random() * 0.2), ry = h * (0.06 + random() * 0.07)
    const n = 160 + Math.floor(random() * 140)
    const tilt = (random() - 0.5) * 0.5
    for (let f = 0; f < n; f++) {
      const a = random() * Math.PI * 2, d = Math.sqrt(random())
      const x = cx + Math.cos(a) * rx * d, y = cy + Math.sin(a) * ry * d + (x - cx) * tilt
      fishShape(ctx, x, y, w * (0.013 + random() * 0.007), flow, `rgba(200,255,230,${0.5 + random() * 0.4})`, tilt * 0.6)
    }
  }
  const schools = 2 + Math.floor(random() * 2)
  for (let k = 0; k < schools; k++) bait()
  const turtles = random() < 0.65 ? 1 + (random() < 0.3 ? 1 : 0) : 0
  for (let t = 0; t < turtles; t++) turtle(ctx, w * (0.15 + random() * 0.7), h * (0.2 + random() * 0.6), w * (0.11 + random() * 0.07), random() < 0.5 ? 1 : -1, (random() - 0.5) * 0.5)
  if (random() < 0.8) {
    const n = 4 + Math.floor(random() * 5), cx = random() * w, cy = h * (0.25 + random() * 0.6), dir = random() < 0.5 ? 1 : -1
    for (let f = 0; f < n; f++) fishShape(ctx, cx + (random() - 0.5) * w * 0.3, cy + (random() - 0.5) * h * 0.08, w * (0.03 + random() * 0.015), dir, `rgba(80,190,140,0.85)`, (random() - 0.5) * 0.2)
  }
  if (random() < 0.08) shark(ctx, w * (0.25 + random() * 0.5), h * (0.25 + random() * 0.55), w * (0.18 + random() * 0.08), random() < 0.5 ? 1 : -1, (random() - 0.5) * 0.25)
  for (let b = 0; b < 30; b++) {
    const x = random() * w, y = random() * h, r = 1 + random() * 3.5
    ctx.strokeStyle = `rgba(190,255,225,${0.12 + random() * 0.3})`
    ctx.lineWidth = 0.7
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
  }
}

function fishShape(ctx, x, y, s, dir, color, tilt) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(tilt || 0)
  ctx.scale(dir, 1)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(s, 0)
  ctx.quadraticCurveTo(s * 0.3, -s * 0.42, -s * 0.6, -s * 0.05)
  ctx.lineTo(-s * 1.1, -s * 0.38)
  ctx.lineTo(-s * 0.95, 0)
  ctx.lineTo(-s * 1.1, s * 0.38)
  ctx.lineTo(-s * 0.6, s * 0.05)
  ctx.quadraticCurveTo(s * 0.3, s * 0.42, s, 0)
  ctx.fill()
  ctx.restore()
}

function turtle(ctx, x, y, s, dir, tilt) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(tilt)
  ctx.scale(dir, 1)
  const body = 'rgba(30,80,58,0.95)'
  ctx.fillStyle = body
  for (const [fx, fy, a, len] of [[s * 0.35, -s * 0.45, -0.9, 1.1], [s * 0.35, s * 0.45, 0.9, 1.1], [-s * 0.55, -s * 0.35, -2.4, 0.55], [-s * 0.55, s * 0.35, 2.4, 0.55]]) {
    ctx.save(); ctx.translate(fx, fy); ctx.rotate(a)
    ctx.beginPath(); ctx.ellipse(s * 0.4 * len, 0, s * 0.45 * len, s * 0.13, 0, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
  }
  ctx.beginPath(); ctx.ellipse(s * 0.85, 0, s * 0.22, s * 0.16, 0, 0, Math.PI * 2); ctx.fill()
  const shell = ctx.createRadialGradient(-s * 0.1, -s * 0.15, 0, 0, 0, s * 0.7)
  shell.addColorStop(0, 'rgba(110,190,140,0.95)')
  shell.addColorStop(1, 'rgba(40,100,70,0.95)')
  ctx.fillStyle = shell
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.7, s * 0.5, 0, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = 'rgba(20,55,38,0.7)'
  ctx.lineWidth = Math.max(0.8, s * 0.03)
  for (const [px, py] of [[-s * 0.25, 0], [s * 0.2, 0], [0, -s * 0.28], [0, s * 0.28], [-s * 0.45, -s * 0.2], [-s * 0.45, s * 0.2], [s * 0.42, -s * 0.2], [s * 0.42, s * 0.2]]) {
    ctx.beginPath()
    for (let k = 0; k <= 6; k++) { const a = k / 6 * Math.PI * 2; const qx = px + Math.cos(a) * s * 0.15, qy = py + Math.sin(a) * s * 0.12; k ? ctx.lineTo(qx, qy) : ctx.moveTo(qx, qy) }
    ctx.stroke()
  }
  ctx.fillStyle = 'rgba(5,20,12,0.9)'
  ctx.beginPath(); ctx.arc(s * 0.95, -s * 0.06, s * 0.035, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
}

function shark(ctx, x, y, s, dir, tilt) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(tilt)
  ctx.scale(dir, 1)
  const g = ctx.createLinearGradient(0, -s * 0.3, 0, s * 0.3)
  g.addColorStop(0, 'rgba(25,60,45,0.97)')
  g.addColorStop(1, 'rgba(90,150,115,0.97)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(s * 1.25, s * 0.02)
  ctx.quadraticCurveTo(s * 1.1, -s * 0.2, s * 0.6, -s * 0.24)
  ctx.lineTo(s * 0.2, -s * 0.26)
  ctx.lineTo(s * 0.05, -s * 0.62)
  ctx.lineTo(-s * 0.15, -s * 0.24)
  ctx.quadraticCurveTo(-s * 0.7, -s * 0.16, -s * 1.0, -s * 0.05)
  ctx.lineTo(-s * 1.35, -s * 0.5)
  ctx.lineTo(-s * 1.2, 0)
  ctx.lineTo(-s * 1.3, s * 0.32)
  ctx.lineTo(-s * 1.0, s * 0.05)
  ctx.quadraticCurveTo(-s * 0.5, s * 0.2, s * 0.2, s * 0.22)
  ctx.lineTo(s * 0.0, s * 0.55)
  ctx.lineTo(s * 0.4, s * 0.2)
  ctx.quadraticCurveTo(s * 1.0, s * 0.18, s * 1.25, s * 0.02)
  ctx.fill()
  ctx.strokeStyle = 'rgba(10,30,20,0.6)'
  ctx.lineWidth = Math.max(0.8, s * 0.012)
  for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.moveTo(s * (0.62 - k * 0.05), -s * 0.12); ctx.lineTo(s * (0.6 - k * 0.05), s * 0.06); ctx.stroke() }
  ctx.fillStyle = 'rgba(5,15,10,0.95)'
  ctx.beginPath(); ctx.arc(s * 0.95, -s * 0.06, s * 0.025, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
}

function drawBamboo(ctx, w, h, random) {
  darkSky(ctx, w, h, '#0c2a17')
  const STALKS = 7 + Math.floor(random() * 6)
  const stalks = []
  for (let s = 0; s < STALKS; s++) stalks.push([random(), random()])
  stalks.sort((a, b) => a[1] - b[1])
  for (const [px, depth] of stalks) {
    const x = px * w
    const width = w * (0.02 + depth * 0.045)
    const shade = 14 + depth * 46
    const lean = (random() - 0.5) * w * 0.05
    const seg = h * (0.08 + random() * 0.06)
    ctx.fillStyle = `rgb(${Math.round(shade * 0.35)},${Math.round(shade)},${Math.round(shade * 0.55)})`
    ctx.beginPath()
    ctx.moveTo(x - width / 2, h)
    ctx.lineTo(x - width / 2 + lean, -10)
    ctx.lineTo(x + width / 2 + lean, -10)
    ctx.lineTo(x + width / 2, h)
    ctx.fill()
    ctx.strokeStyle = `rgba(51,255,102,${0.12 + depth * 0.3})`
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x - width / 2 + width * 0.18, h)
    ctx.lineTo(x - width / 2 + width * 0.18 + lean, -10)
    ctx.stroke()
    for (let y = h - seg * random(); y > 0; y -= seg) {
      const xo = x + lean * (1 - y / h)
      ctx.fillStyle = `rgba(2,8,4,${0.55 + depth * 0.3})`
      ctx.fillRect(xo - width / 2 - 1, y - 2, width + 2, 3)
      ctx.fillStyle = `rgba(157,255,187,${0.1 + depth * 0.25})`
      ctx.fillRect(xo - width / 2 - 1, y + 1, width + 2, 1)
      if (random() < 0.35) {
        const leaves = 2 + Math.floor(random() * 4)
        for (let l = 0; l < leaves; l++) {
          const dir = random() < 0.5 ? -1 : 1
          const len = w * (0.06 + depth * 0.08) * (0.7 + random() * 0.5)
          const ang = dir * (0.3 + random() * 0.8) + Math.PI / 2 * 0
          ctx.save()
          ctx.translate(xo, y)
          ctx.rotate(dir > 0 ? 0.25 + random() * 0.6 : Math.PI - 0.25 - random() * 0.6)
          ctx.fillStyle = `rgb(${Math.round(shade * 0.4)},${Math.round(shade * 1.15)},${Math.round(shade * 0.6)})`
          ctx.beginPath()
          ctx.moveTo(0, 0)
          ctx.quadraticCurveTo(len * 0.5, -len * 0.12, len, len * 0.05)
          ctx.quadraticCurveTo(len * 0.5, len * 0.08, 0, 0)
          ctx.fill()
          ctx.restore()
        }
      }
    }
  }
}

function drawFern(ctx, w, h, random) {
  const g = ctx.createRadialGradient(w / 2, h * 0.75, 0, w / 2, h * 0.6, h)
  g.addColorStop(0, '#0a2414')
  g.addColorStop(1, '#020504')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  const img = ctx.getImageData(0, 0, w, h)
  const SPECIES = Object.keys(FERN_SPECIES)
  const TINTS = [[6, 34, 14], [6, 34, 14], [4, 30, 22], [10, 34, 18], [5, 26, 24]]
  const roll = (random() < 0.1 ? 'climb' : random() < 0.35 ? 'sides' : 'ground')
  const mixed = random() < 0.5
  const main = SPECIES[Math.floor(random() * SPECIES.length)]
  const speciesFor = () => mixed ? SPECIES[Math.floor(random() * SPECIES.length)] : main
  const tint = () => TINTS[Math.floor(random() * TINTS.length)]
  const density = (height) => Math.min(260000, 90000 + height * 160)
  if (roll === 'climb') {
    const COUNT = 1 + Math.floor(random() * 2)
    for (let k = 0; k < COUNT; k++) {
      const height = h * (0.95 + random() * 0.3)
      const x = COUNT === 1 ? w * (0.3 + random() * 0.4) : w * (k === 0 ? 0.2 + random() * 0.15 : 0.65 + random() * 0.15)
      plotFern(img, w, h, fernMaps(speciesFor(), random), { x, y: h * 1.02, height, tilt: (random() - 0.5) * 0.25, flip: random() < 0.5, color: tint(), bright: 0.5 + random() * 0.3, points: density(height) * 1.4 }, random)
    }
    const SMALL = 2 + Math.floor(random() * 3)
    for (let k = 0; k < SMALL; k++) {
      const height = h * (0.18 + random() * 0.2)
      plotFern(img, w, h, fernMaps(speciesFor(), random), { x: random() * w, y: h * 1.02, height, tilt: (random() - 0.5) * 0.9, flip: random() < 0.5, color: tint(), bright: 0.3 + random() * 0.3, points: density(height) }, random)
    }
  } else if (roll === 'sides') {
    const COUNT = 2 + Math.floor(random() * 3)
    for (let k = 0; k < COUNT; k++) {
      const left = k % 2 === 0
      const height = h * (0.35 + random() * 0.35)
      plotFern(img, w, h, fernMaps(speciesFor(), random), { x: left ? w * 0.02 : w * 0.98, y: h * (0.75 + random() * 0.3), height, tilt: (left ? -1 : 1) * (0.35 + random() * 0.45), flip: !left, color: tint(), bright: 0.4 + random() * 0.5, points: density(height) }, random)
    }
  } else {
    const COUNT = 2 + Math.floor(random() * 4)
    for (let k = 0; k < COUNT; k++) {
      const height = h * (0.3 + random() * 0.4)
      const x = w * (0.08 + random() * 0.84)
      plotFern(img, w, h, fernMaps(speciesFor(), random), { x, y: h * (1.01 + random() * 0.04), height, tilt: (random() - 0.5) * 0.8 + (x < w / 2 ? -0.2 : 0.2), flip: random() < 0.5, color: tint(), bright: 0.35 + random() * 0.6, points: density(height) }, random)
    }
  }
  ctx.putImageData(img, 0, 0)
}

const FERN_SPECIES = {
  barnsley: [[0, 0, 0, 0.16, 0, 0, 0.01], [0.85, 0.04, -0.04, 0.85, 0, 1.6, 0.85], [0.2, -0.26, 0.23, 0.22, 0, 1.6, 0.07], [-0.15, 0.28, 0.26, 0.24, 0, 0.44, 0.07]],
  cyclosorus: [[0, 0, 0, 0.25, 0, -0.4, 0.02], [0.95, 0.005, -0.005, 0.93, -0.002, 0.5, 0.84], [0.035, -0.2, 0.16, 0.04, -0.09, 0.02, 0.07], [-0.04, 0.2, 0.16, 0.04, 0.083, 0.12, 0.07]],
  culcita: [[0, 0, 0, 0.25, 0, -0.14, 0.02], [0.85, 0.02, -0.02, 0.83, 0, 1.0, 0.84], [0.09, -0.28, 0.3, 0.11, 0, 0.6, 0.07], [-0.09, 0.28, 0.3, 0.09, 0, 0.7, 0.07]],
  fishbone: [[0, 0, 0, 0.25, 0, -0.4, 0.02], [0.95, 0.002, -0.002, 0.93, -0.002, 0.5, 0.84], [0.035, -0.11, 0.27, 0.01, -0.05, 0.005, 0.07], [-0.04, 0.11, 0.27, 0.01, 0.047, 0.06, 0.07]]
}

function fernMaps(species, random) {
  const base = FERN_SPECIES[species]
  const curl = (random() - 0.5) * 0.06
  return base.map((m, i) => {
    const [a, b, c, d, e, f, p] = m
    if (i !== 1) return [a, b, c, d, e, f, p]
    return [a, b + curl, c - curl, d, e, f, p]
  })
}

function plotFern(img, w, h, maps, opts, random) {
  const pick = (r) => { let acc = 0; for (const m of maps) { acc += m[6]; if (r < acc) return m } return maps[maps.length - 1] }
  let x = 0, y = 0
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (let n = 0; n < 6000; n++) {
    const [a, b, c, d, e, f] = pick(random())
    const nx = a * x + b * y + e, ny = c * x + d * y + f
    x = nx; y = ny
    if (n > 30) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y) }
  }
  const scale = opts.height / (maxY - minY)
  const cos = Math.cos(opts.tilt), sin = Math.sin(opts.tilt)
  const flip = opts.flip ? -1 : 1
  const [cr, cg, cb] = opts.color
  const POINTS = Math.round(opts.points)
  x = 0; y = 0
  for (let n = 0; n < POINTS; n++) {
    const [a, b, c, d, e, f] = pick(random())
    const nx = a * x + b * y + e, ny = c * x + d * y + f
    x = nx; y = ny
    if (n < 20) continue
    const lx = (x - (minX + maxX) / 2) * scale * flip, ly = (y - minY) * scale
    const px = Math.round(opts.x + lx * cos - ly * sin), py = Math.round(opts.y - (lx * sin + ly * cos))
    if (px < 0 || py < 0 || px >= w || py >= h) continue
    const p = (py * w + px) * 4
    img.data[p] = Math.min(255, img.data[p] + cr * opts.bright)
    img.data[p + 1] = Math.min(255, img.data[p + 1] + cg * opts.bright)
    img.data[p + 2] = Math.min(255, img.data[p + 2] + cb * opts.bright)
  }
}

function drawBeach(ctx, w, h, random) {
  const noise = valueNoise(random)
  const horizon = h * (0.5 + random() * 0.06)
  const sky = ctx.createLinearGradient(0, 0, 0, horizon)
  sky.addColorStop(0, '#2f7a4c')
  sky.addColorStop(0.7, '#7fc898')
  sky.addColorStop(1, '#b8e8c6')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, horizon)
  const sunX = w * (0.15 + random() * 0.7), sunY = h * (0.07 + random() * 0.12), sunR = w * (0.06 + random() * 0.04)
  glowDot(ctx, sunX, sunY, sunR * 1.2, sunR * 4, '220,255,230', 0.35)
  ctx.fillStyle = '#f0fff4'
  ctx.beginPath(); ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2); ctx.fill()
  for (let c = 0; c < 3 + Math.floor(random() * 4); c++) {
    const cx = random() * w, cy = horizon * (0.15 + random() * 0.6), size = w * (0.1 + random() * 0.15)
    for (let p = 0; p < 8; p++) {
      const px = cx + (random() - 0.5) * size * 1.6, py = cy + (random() - 0.5) * size * 0.25, r = size * (0.2 + random() * 0.3)
      const g = ctx.createRadialGradient(px, py, 0, px, py, r)
      g.addColorStop(0, 'rgba(235,255,240,0.55)')
      g.addColorStop(1, 'rgba(235,255,240,0)')
      ctx.fillStyle = g
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill()
    }
  }
  ctx.strokeStyle = 'rgba(30,70,45,0.7)'
  ctx.lineCap = 'round'
  for (let b = 0; b < 2 + Math.floor(random() * 4); b++) {
    const bx = random() * w, by = horizon * (0.2 + random() * 0.5), s = w * (0.01 + random() * 0.012)
    ctx.lineWidth = 1.4
    ctx.beginPath(); ctx.moveTo(bx - s, by - s * 0.35); ctx.quadraticCurveTo(bx - s * 0.45, by - s * 0.55, bx, by); ctx.quadraticCurveTo(bx + s * 0.45, by - s * 0.55, bx + s, by - s * 0.35); ctx.stroke()
  }
  const shoreY = h * (0.72 + random() * 0.06)
  const sea = ctx.createLinearGradient(0, horizon, 0, shoreY)
  sea.addColorStop(0, '#2b8a68')
  sea.addColorStop(1, '#5fc6a0')
  ctx.fillStyle = sea
  ctx.fillRect(0, horizon, w, shoreY - horizon + h * 0.06)
  ctx.globalCompositeOperation = 'lighter'
  for (let g = 0; g < 160; g++) {
    const t = random()
    const y = horizon + Math.pow(t, 1.3) * (shoreY - horizon)
    const x = sunX + (random() - 0.5) * w * (0.08 + t * 0.4)
    ctx.fillStyle = `rgba(230,255,240,${0.2 + random() * 0.35})`
    ctx.fillRect(x, y, 2 + t * 12 * random(), 1 + t)
  }
  ctx.globalCompositeOperation = 'source-over'
  for (let r = 0; r < 10; r++) {
    const t = (r + 1) / 11
    const y = horizon + Math.pow(t, 1.4) * (shoreY - horizon)
    ctx.strokeStyle = `rgba(220,255,235,${0.12 + t * 0.15})`
    ctx.lineWidth = 0.8 + t
    ctx.beginPath()
    for (let x = 0; x <= w; x += 6) { const yy = y + Math.sin(x * 0.02 / (0.3 + t) + r * 3) * (1 + t * 3); x ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy) }
    ctx.stroke()
  }
  if (random() < 0.5) {
    const bx = w * (0.1 + random() * 0.8), s = w * (0.022 + random() * 0.015)
    ctx.fillStyle = 'rgba(240,255,245,0.9)'
    ctx.beginPath(); ctx.moveTo(bx, horizon - s * 1.8); ctx.lineTo(bx, horizon - s * 0.2); ctx.lineTo(bx + s, horizon - s * 0.2); ctx.fill()
    ctx.fillStyle = 'rgba(40,80,55,0.9)'
    ctx.beginPath(); ctx.moveTo(bx - s, horizon - s * 0.15); ctx.lineTo(bx + s * 1.2, horizon - s * 0.15); ctx.lineTo(bx + s * 0.8, horizon + s * 0.15); ctx.lineTo(bx - s * 0.7, horizon + s * 0.15); ctx.fill()
  }
  const edge = []
  for (let x = 0; x <= w; x += 4) edge.push([x, shoreY + Math.sin(x / w * 5 + random()) * h * 0.012 + noise(x / w * 6, 3) * h * 0.02])
  ctx.fillStyle = 'rgba(215,250,225,0.85)'
  ctx.beginPath(); edge.forEach(([x, y], i) => i ? ctx.lineTo(x, y - 6) : ctx.moveTo(x, y - 6))
  for (let i = edge.length - 1; i >= 0; i--) ctx.lineTo(edge[i][0], edge[i][1] + 3)
  ctx.fill()
  const sand = ctx.createLinearGradient(0, shoreY, 0, h)
  sand.addColorStop(0, '#c9dcae')
  sand.addColorStop(1, '#a9c48f')
  ctx.fillStyle = sand
  ctx.beginPath(); edge.forEach(([x, y], i) => i ? ctx.lineTo(x, y + 2) : ctx.moveTo(x, y + 2)); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.fill()
  ctx.fillStyle = 'rgba(70,100,60,0.35)'
  for (let d = 0; d < 1600; d++) ctx.fillRect(random() * w, shoreY + random() * (h - shoreY), 1, 1)
  ctx.fillStyle = 'rgba(150,190,130,0.5)'
  ctx.beginPath(); edge.forEach(([x, y], i) => i ? ctx.lineTo(x, y + 4) : ctx.moveTo(x, y + 4))
  for (let i = edge.length - 1; i >= 0; i--) ctx.lineTo(edge[i][0], edge[i][1] + 14 + Math.sin(i) * 2)
  ctx.fill()
  if (random() < 0.75) {
    const side = random() < 0.5 ? -1 : 1
    const baseX = side < 0 ? w * (0.02 + random() * 0.18) : w * (0.8 + random() * 0.18)
    const baseY = h * (0.98 + random() * 0.04)
    const topX = baseX - side * w * (0.15 + random() * 0.15), topY = h * (0.08 + random() * 0.1)
    ctx.strokeStyle = '#1d3a26'
    ctx.lineCap = 'round'
    for (let k = 0; k < 20; k++) {
      const t0 = k / 20, t1 = (k + 1) / 20
      const p = (t) => [baseX + (topX - baseX) * t + Math.sin(t * 3) * side * w * 0.04, baseY + (topY - baseY) * t]
      const [x0, y0] = p(t0), [x1, y1] = p(t1)
      ctx.lineWidth = w * (0.035 - t0 * 0.018)
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke()
    }
    ctx.fillStyle = '#1d3a26'
    for (let f = 0; f < 8; f++) {
      const a = -Math.PI / 2 + (f / 7 - 0.5) * Math.PI * 1.7 + (random() - 0.5) * 0.2
      const len = w * (0.16 + random() * 0.08)
      const ex = topX + Math.cos(a) * len, ey = topY + Math.sin(a) * len * 0.6 + len * 0.25
      ctx.beginPath()
      ctx.moveTo(topX, topY)
      ctx.quadraticCurveTo(topX + Math.cos(a) * len * 0.5, topY + Math.sin(a) * len * 0.6 - len * 0.15, ex, ey)
      ctx.quadraticCurveTo(topX + Math.cos(a) * len * 0.5, topY + Math.sin(a) * len * 0.6 - len * 0.02, topX, topY + 3)
      ctx.fill()
    }
  }
  for (let s = 0; s < 6; s++) {
    const x = random() * w, y = shoreY + h * 0.05 + random() * (h - shoreY - h * 0.08), r = w * (0.006 + random() * 0.008)
    ctx.fillStyle = 'rgba(235,255,240,0.7)'
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.6, random(), 0, Math.PI * 2); ctx.fill()
  }
}

function drawWinterBranches(ctx, w, h, random) {
  drawBranchTangle(ctx, w, h, random)
  ctx.globalCompositeOperation = 'color'
  ctx.fillStyle = 'rgba(60,200,110,0.5)'
  ctx.fillRect(0, 0, w, h)
  ctx.globalCompositeOperation = 'source-over'
}

function drawBranchTangle(ctx, w, h, random) {
  const sky = ctx.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, '#93b8a0')
  sky.addColorStop(0.55, '#6f9580')
  sky.addColorStop(1, '#3d5c4a')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = '#030805'
  ctx.lineCap = 'round'
  const limb = (x, y, ang, len, thick, depth) => {
    if (depth === 0 || thick < 0.35) return
    let cx = x, cy = y
    const steps = 5 + Math.floor(random() * 5)
    for (let s = 0; s < steps; s++) {
      ang += (random() - 0.5) * 0.75
      ang += (-Math.PI / 2 - ang) * 0.06
      const nx = cx + Math.cos(ang) * len / steps, ny = cy + Math.sin(ang) * len / steps
      ctx.lineWidth = Math.max(0.35, thick * (1 - s / steps * 0.35))
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(nx, ny)
      ctx.stroke()
      cx = nx; cy = ny
      if (random() < 0.3) limb(cx, cy, ang + (random() - 0.5) * 2.2, len * 0.38, thick * 0.4, depth - 2)
    }
    const kids = random() < 0.3 ? 3 : 2
    for (let k = 0; k < kids; k++) limb(cx, cy, ang + (k - (kids - 1) / 2) * (0.35 + random() * 0.5) + (random() - 0.5) * 0.3, len * (0.68 + random() * 0.14), thick * 0.64, depth - 1)
  }
  const TREES = 3 + Math.floor(random() * 4)
  for (let t = 0; t < TREES; t++) {
    const x = w * (t + 0.5 + (random() - 0.5) * 0.6) / TREES
    const trunk = w * (0.025 + random() * 0.03)
    limb(x, h + 10, -Math.PI / 2 + (random() - 0.5) * 0.25, h * (0.16 + random() * 0.08), trunk, 11)
  }
}

function drawMushrooms(ctx, w, h, random) {
  darkSky(ctx, w, h, '#071a10')
  const groundY = h * (0.82 + random() * 0.05)
  const mound = ctx.createLinearGradient(0, groundY - h * 0.05, 0, h)
  mound.addColorStop(0, '#071a0e')
  mound.addColorStop(1, '#010402')
  ctx.fillStyle = mound
  ctx.beginPath()
  ctx.moveTo(0, h)
  const hump = w * (0.2 + random() * 0.6)
  for (let x = 0; x <= w; x += 6) ctx.lineTo(x, groundY - Math.exp(-(((x - hump) / (w * 0.3)) ** 2)) * h * 0.05 + Math.sin(x * 0.05) * 2)
  ctx.lineTo(w, h)
  ctx.fill()
  if (random() < 0.5) {
    const lx = w * (random() < 0.5 ? -0.1 : 0.45)
    ctx.fillStyle = '#0a1a10'
    ctx.beginPath(); ctx.roundRect(lx, groundY - h * 0.05, w * 0.65, h * 0.05, h * 0.025); ctx.fill()
    ctx.strokeStyle = 'rgba(80,160,110,0.25)'
    ctx.lineWidth = 1
    for (let r = 0; r < 4; r++) { ctx.beginPath(); ctx.moveTo(lx + 10, groundY - h * (0.012 + r * 0.01)); ctx.lineTo(lx + w * 0.6, groundY - h * (0.012 + r * 0.01) + (random() - 0.5) * 3); ctx.stroke() }
  }
  const tints = [TINT.green, TINT.teal, TINT.mint]
  const clusters = 1 + Math.floor(random() * 3)
  const items = []
  for (let c = 0; c < clusters; c++) {
    const cx = w * (0.15 + random() * 0.7)
    const tint = tints[Math.floor(random() * tints.length)]
    const n = 3 + Math.floor(random() * 5)
    for (let s = 0; s < n; s++) items.push([cx + (random() - 0.5) * w * 0.28, random(), tint])
  }
  items.sort((a, b) => a[1] - b[1])
  for (const [x, depth, tint] of items) {
    const scale = 0.4 + depth * 0.7
    const stemH = h * 0.08 * scale * (0.6 + random() * 0.7)
    const capR = w * 0.07 * scale * (0.6 + random() * 0.5)
    const baseY = groundY + h * 0.02 * (depth - 0.5)
    const lean = (random() - 0.5) * capR * 0.6
    glowDot(ctx, x + lean, baseY - stemH, capR * 0.7, capR * 2.4, tint, 0.16 + depth * 0.14)
    ctx.fillStyle = `rgba(190,230,205,${0.5 + depth * 0.35})`
    ctx.beginPath()
    ctx.moveTo(x - capR * 0.15, baseY)
    ctx.quadraticCurveTo(x - capR * 0.2 + lean * 0.4, baseY - stemH * 0.5, x - capR * 0.12 + lean, baseY - stemH)
    ctx.lineTo(x + capR * 0.12 + lean, baseY - stemH)
    ctx.quadraticCurveTo(x + capR * 0.2 + lean * 0.4, baseY - stemH * 0.5, x + capR * 0.15, baseY)
    ctx.fill()
    const cx = x + lean, cy = baseY - stemH
    ctx.strokeStyle = `rgba(${tint},0.35)`
    ctx.lineWidth = 0.8
    for (let g = -6; g <= 6; g++) { ctx.beginPath(); ctx.moveTo(cx, cy + capR * 0.05); ctx.lineTo(cx + g / 6 * capR * 0.95, cy + capR * 0.02); ctx.stroke() }
    const cap = ctx.createRadialGradient(cx, cy - capR * 0.35, 0, cx, cy, capR)
    cap.addColorStop(0, `rgba(${tint},0.98)`)
    cap.addColorStop(1, `rgba(${tint},0.5)`)
    ctx.fillStyle = cap
    ctx.beginPath()
    const domed = random() < 0.6
    ctx.ellipse(cx, cy, capR, capR * (domed ? 0.7 : 0.38), 0, Math.PI, 0)
    ctx.quadraticCurveTo(cx, cy + capR * 0.16, cx - capR, cy)
    ctx.fill()
    for (let d = 0; d < 5; d++) {
      ctx.fillStyle = 'rgba(225,255,235,0.65)'
      ctx.beginPath()
      ctx.arc(cx + (random() - 0.5) * capR * 1.3, cy - capR * (0.1 + random() * (domed ? 0.45 : 0.22)), capR * (0.04 + random() * 0.05), 0, Math.PI * 2)
      ctx.fill()
    }
  }
  for (const [x0] of items) {
    for (let s = 0; s < 14; s++) {
      const rise = Math.pow(random(), 1.6)
      const x = x0 + (random() - 0.5) * w * (0.06 + rise * 0.25)
      const y = groundY - h * 0.04 - rise * h * 0.3
      const r = 0.4 + random() * 0.8
      ctx.fillStyle = `rgba(200,255,215,${(0.25 + random() * 0.5) * (1 - rise * 0.7)})`
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    }
  }
  for (let s = 0; s < 8; s++) glowDot(ctx, w * (0.1 + random() * 0.8), groundY - h * (0.05 + random() * 0.25), 0.6, 2.5, '157,255,187', 0.4)
}

function drawCherryBranch(ctx, w, h, random) {
  darkSky(ctx, w, h, '#14201a')
  const blossom = (x, y, r) => {
    const turn = random() * Math.PI
    const pink = 160 + Math.floor(random() * 50)
    ctx.fillStyle = `rgba(255,${pink},${190 + Math.floor(random() * 40)},${0.7 + random() * 0.25})`
    for (let k = 0; k < 5; k++) {
      const a = turn + (k / 5) * Math.PI * 2
      ctx.beginPath()
      ctx.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.5, r * 0.36, a, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = 'rgba(255,230,140,0.9)'
    ctx.beginPath(); ctx.arc(x, y, r * 0.18, 0, Math.PI * 2); ctx.fill()
  }
  const flowers = []
  const branch = (x, y, ang, len, thick, depth) => {
    let cx = x, cy = y
    const steps = 7
    ctx.strokeStyle = '#1b120e'
    ctx.lineCap = 'round'
    for (let s = 0; s < steps; s++) {
      ang += (random() - 0.5) * 0.3
      const nx = cx + Math.cos(ang) * len / steps, ny = cy + Math.sin(ang) * len / steps
      ctx.lineWidth = Math.max(0.7, thick * (1 - s / steps * 0.35))
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(nx, ny); ctx.stroke()
      cx = nx; cy = ny
      if (depth <= 2 && random() < 0.18) flowers.push([cx + (random() - 0.5) * thick * 3, cy + (random() - 0.5) * thick * 3])
      if (depth > 1 && random() < 0.22) branch(cx, cy, ang + (random() < 0.5 ? -1 : 1) * (0.5 + random() * 0.5), len * 0.45, thick * 0.5, depth - 2)
    }
    if (depth <= 0 || thick < 0.8) { if (random() < 0.6) flowers.push([cx, cy]); return }
    const kids = random() < 0.4 ? 3 : 2
    for (let k = 0; k < kids; k++) branch(cx, cy, ang + (k - (kids - 1) / 2) * (0.4 + random() * 0.3), len * (0.66 + random() * 0.12), thick * 0.64, depth - 1)
  }
  const fromLeft = random() < 0.5
  const limbs = 1 + Math.floor(random() * 2)
  for (let l = 0; l < limbs; l++) {
    const y = h * (0.06 + random() * 0.3) + l * h * 0.18
    branch(fromLeft ? -10 : w + 10, y, fromLeft ? 0.1 + random() * 0.35 : Math.PI - 0.1 - random() * 0.35, w * (0.34 + random() * 0.1), w * (0.03 - l * 0.008), 6)
  }
  for (const [fx, fy] of flowers) blossom(fx, fy, w * (0.011 + random() * 0.011))
  for (let p = 0; p < 26; p++) {
    ctx.save()
    ctx.translate(random() * w, h * (0.3 + random() * 0.7))
    ctx.rotate(random() * Math.PI)
    ctx.fillStyle = `rgba(255,185,210,${0.25 + random() * 0.45})`
    ctx.beginPath(); ctx.ellipse(0, 0, w * 0.009, w * 0.005, 0, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
  }
}

function drawBulbs(ctx, w, h, random) {
  const g = ctx.createLinearGradient(0, 0, w, h)
  g.addColorStop(0, '#020604')
  g.addColorStop(1, '#071a0e')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  const tints = [TINT.green, TINT.mint, TINT.teal]
  ctx.globalCompositeOperation = 'lighter'
  const BULBS = 70 + Math.floor(random() * 40)
  for (let n = 0; n < BULBS; n++) {
    const depth = random()
    const r = w * (0.015 + depth * depth * 0.14)
    const x = random() * w, y = random() * h
    const color = tints[Math.floor(random() * tints.length)]
    const alpha = 0.05 + (1 - depth) * 0.18
    const soft = random() < 0.6
    const disc = ctx.createRadialGradient(x, y, 0, x, y, r)
    disc.addColorStop(0, `rgba(${color},${alpha * 0.7})`)
    disc.addColorStop(soft ? 0.6 : 0.86, `rgba(${color},${alpha})`)
    disc.addColorStop(soft ? 1 : 0.94, `rgba(${color},${soft ? 0 : alpha * 1.4})`)
    if (!soft) disc.addColorStop(1, `rgba(${color},0)`)
    ctx.fillStyle = disc
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  for (let n = 0; n < 50; n++) glowDot(ctx, random() * w, random() * h, 1 + random() * 1.5, 3 + random() * 6, tints[Math.floor(random() * tints.length)], 0.5 + random() * 0.4)
  ctx.globalCompositeOperation = 'source-over'
}

function drawMeadow(ctx, w, h, random) {
  darkSky(ctx, w, h, '#0e2e19')
  for (let n = 0; n < 160; n++) {
    ctx.globalAlpha = 0.15 + random() * 0.5
    ctx.fillStyle = PALETTE.mint
    ctx.fillRect(random() * w, random() * h * 0.5, 1, 1)
  }
  ctx.globalAlpha = 1
  const moonX = w * (0.15 + random() * 0.7), moonY = h * (0.08 + random() * 0.1)
  glowDot(ctx, moonX, moonY, w * 0.035, w * 0.09, TINT.mint, 0.75)
  const CLOUDS = 3 + Math.floor(random() * 4)
  for (let c = 0; c < CLOUDS; c++) cloud(ctx, random() * w, h * (0.06 + random() * 0.45), w * (0.12 + random() * 0.18), random, 0.08 + random() * 0.08)
  ctx.strokeStyle = 'rgba(190,230,205,0.75)'
  ctx.lineCap = 'round'
  const flocks = 1 + Math.floor(random() * 2)
  for (let f = 0; f < flocks; f++) {
    const fx = w * (0.1 + random() * 0.8), fy = h * (0.12 + random() * 0.4)
    const count = 3 + Math.floor(random() * 6)
    for (let b = 0; b < count; b++) {
      ctx.lineWidth = 1.4
      bird(ctx, fx + (random() - 0.3) * w * 0.25, fy + (random() - 0.5) * h * 0.06, w * (0.008 + random() * 0.012))
    }
  }
  if (random() < 0.75) airplane(ctx, w * (0.25 + random() * 0.6), h * (0.05 + random() * 0.2), w * 0.022, -0.15 + random() * 0.3, w)
  const LAYERS = 4
  for (let l = 0; l < LAYERS; l++) {
    const t = l / (LAYERS - 1)
    const base = h * (0.8 + t * 0.2) + 4
    const shade = Math.round(18 + t * 34)
    const col = `rgb(${Math.round(shade * 0.3)},${shade},${Math.round(shade * 0.55)})`
    ctx.fillStyle = col
    ctx.strokeStyle = col
    const count = Math.round(w / (5 - t * 2.5))
    for (let n = 0; n < count; n++) {
      const x = random() * w
      const height = h * (0.04 + random() * (0.08 + t * 0.1))
      const lean = (random() - 0.4) * w * 0.05
      ctx.beginPath()
      ctx.moveTo(x - 1 - t * 2, base)
      ctx.quadraticCurveTo(x + lean * 0.4, base - height * 0.6, x + lean, base - height)
      ctx.quadraticCurveTo(x + lean * 0.4, base - height * 0.55, x + 1 + t * 2, base)
      ctx.fill()
    }
    const stems = Math.round(4 + random() * 5 + t * 4)
    for (let n = 0; n < stems; n++) {
      const x = random() * w
      const top = base - h * (0.1 + random() * (0.12 + t * 0.12))
      const lean = (random() - 0.5) * w * 0.06
      ctx.lineWidth = 1 + t * 1.5
      ctx.beginPath()
      ctx.moveTo(x, base)
      ctx.quadraticCurveTo(x + lean * 0.2, (base + top) / 2, x + lean, top)
      ctx.stroke()
      const r = w * (0.012 + t * 0.022) * (0.7 + random() * 0.6)
      const color = random() < 0.5 ? TINT.green : random() < 0.6 ? TINT.mint : TINT.teal
      ctx.fillStyle = `rgba(${color},0.8)`
      const petals = 5 + Math.floor(random() * 4), turn = random() * Math.PI
      for (let k = 0; k < petals; k++) {
        const a = turn + (k / petals) * Math.PI * 2
        ctx.beginPath()
        ctx.ellipse(x + lean + Math.cos(a) * r * 0.6, top + Math.sin(a) * r * 0.6, r * 0.55, r * 0.25, a, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.fillStyle = col
    }
  }
  for (let n = 0; n < 24; n++) glowDot(ctx, random() * w, h * (0.6 + random() * 0.3), 1.2, 4 + random() * 5, TINT.mint, 0.5 + random() * 0.4)
}

function cloud(ctx, x, y, size, random, alpha) {
  const puffs = 6 + Math.floor(random() * 6)
  for (let p = 0; p < puffs; p++) {
    const px = x + (random() - 0.5) * size * 1.6
    const py = y + (random() - 0.5) * size * 0.35
    const r = size * (0.25 + random() * 0.35)
    const g = ctx.createRadialGradient(px, py, 0, px, py, r)
    g.addColorStop(0, `rgba(120,170,140,${alpha})`)
    g.addColorStop(1, 'rgba(120,170,140,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(px, py, r, 0, Math.PI * 2)
    ctx.fill()
  }
}

function bird(ctx, x, y, s) {
  ctx.beginPath()
  ctx.moveTo(x - s, y - s * 0.35)
  ctx.quadraticCurveTo(x - s * 0.45, y - s * 0.55, x, y)
  ctx.quadraticCurveTo(x + s * 0.45, y - s * 0.55, x + s, y - s * 0.35)
  ctx.stroke()
}

function airplane(ctx, x, y, s, angle, w) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.strokeStyle = 'rgba(157,255,187,0.18)'
  ctx.lineWidth = s * 0.18
  ctx.beginPath()
  ctx.moveTo(-s * 1.2, 0)
  ctx.lineTo(-w * 0.45, 0)
  ctx.stroke()
  ctx.fillStyle = 'rgba(200,230,210,0.9)'
  ctx.beginPath()
  ctx.ellipse(0, 0, s, s * 0.12, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(s * 0.15, 0); ctx.lineTo(-s * 0.25, -s * 0.75); ctx.lineTo(-s * 0.4, -s * 0.75); ctx.lineTo(-s * 0.15, 0)
  ctx.lineTo(-s * 0.4, s * 0.75); ctx.lineTo(-s * 0.25, s * 0.75); ctx.closePath()
  ctx.fill()
  ctx.restore()
  glowDot(ctx, x, y, 1.2, 4, '225,255,235', 0.9)
}

function drawCircuitBoard(ctx, w, h, random) {
  const base = ctx.createLinearGradient(0, 0, w, h)
  base.addColorStop(0, '#031008')
  base.addColorStop(1, '#06180d')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, w, h)
  const GRID = Math.round(w / 54)
  const cols = Math.floor(w / GRID), rows = Math.floor(h / GRID)
  ctx.strokeStyle = 'rgba(51,255,102,0.05)'
  ctx.lineWidth = 1
  for (let k = -rows; k < cols; k += 2) { ctx.beginPath(); ctx.moveTo(k * GRID, 0); ctx.lineTo((k + rows) * GRID, rows * GRID); ctx.stroke() }
  const taken = new Uint8Array(cols * rows)
  const free = (c, r) => c >= 0 && r >= 0 && c < cols && r < rows && !taken[r * cols + c]
  const mark = (c, r) => { if (c >= 0 && r >= 0 && c < cols && r < rows) taken[r * cols + c] = 1 }
  const chips = []
  const CHIPS = 4 + Math.floor(random() * 4)
  for (let n = 0; n < CHIPS * 6 && chips.length < CHIPS; n++) {
    const big = chips.length === 0 || random() < 0.25
    const cw = big ? 7 + Math.floor(random() * 5) : 3 + Math.floor(random() * 4)
    const ch = big ? 7 + Math.floor(random() * 5) : 2 + Math.floor(random() * 3)
    const cx = 2 + Math.floor(random() * (cols - cw - 4)), cy = 2 + Math.floor(random() * (rows - ch - 4))
    let ok = true
    for (let r = cy - 2; r <= cy + ch + 1 && ok; r++) for (let c = cx - 2; c <= cx + cw + 1; c++) if (!free(c, r)) { ok = false; break }
    if (!ok) continue
    for (let r = cy - 1; r <= cy + ch; r++) for (let c = cx - 1; c <= cx + cw; c++) mark(c, r)
    chips.push([cx, cy, cw, ch, big])
  }
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]
  const traces = []
  const route = (sc, sr, dir, layer) => {
    let c = sc, r = sr
    const pts = [[c, r]]
    const len = 6 + Math.floor(random() * 50)
    for (let s = 0; s < len; s++) {
      if (random() < 0.1) dir = (dir + (random() < 0.5 ? 1 : 3)) % 4
      const nc = c + DIRS[dir][0], nr = r + DIRS[dir][1]
      if (!free(nc, nr)) break
      c = nc; r = nr
      if (layer === 0) mark(c, r)
      pts.push([c, r])
    }
    if (pts.length > 2) traces.push({ pts, layer, wide: random() < 0.15 })
  }
  for (const [cx, cy, cw, ch] of chips) {
    for (let c = cx; c < cx + cw; c++) { if (random() < 0.8) route(c, cy - 1, 3, 0); if (random() < 0.8) route(c, cy + ch, 1, 0) }
    for (let r = cy; r < cy + ch; r++) { if (random() < 0.7) route(cx - 1, r, 2, 0); if (random() < 0.7) route(cx + cw, r, 0, 0) }
  }
  for (let n = 0; n < 70; n++) route(Math.floor(random() * cols), Math.floor(random() * rows), Math.floor(random() * 4), random() < 0.5 ? 1 : 0)
  const at = (c, r) => [c * GRID + GRID / 2, r * GRID + GRID / 2]
  const smooth = (pts) => {
    const out = [pts[0]]
    for (let i = 1; i < pts.length - 1; i++) {
      const [a, b, c] = [pts[i - 1], pts[i], pts[i + 1]]
      if ((b[0] - a[0]) !== (c[0] - b[0]) || (b[1] - a[1]) !== (c[1] - b[1])) out.push([b[0] - (b[0] - a[0]) * 0.45, b[1] - (b[1] - a[1]) * 0.45], [b[0] + (c[0] - b[0]) * 0.45, b[1] + (c[1] - b[1]) * 0.45])
      else out.push(b)
    }
    out.push(pts[pts.length - 1])
    return out
  }
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const layer of [1, 0]) for (const t of traces.filter((q) => q.layer === layer)) {
    const p = smooth(t.pts).map(([c, r]) => at(c, r))
    ctx.strokeStyle = layer === 1 ? 'rgba(31,209,168,0.16)' : `rgba(51,255,102,${0.35 + random() * 0.25})`
    ctx.lineWidth = GRID * (t.wide ? 0.42 : 0.2)
    ctx.beginPath()
    p.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))
    ctx.stroke()
    const [ex, ey] = p[p.length - 1]
    ctx.fillStyle = '#031008'
    ctx.strokeStyle = layer === 1 ? 'rgba(31,209,168,0.3)' : 'rgba(157,255,187,0.75)'
    ctx.lineWidth = GRID * 0.12
    ctx.beginPath(); ctx.arc(ex, ey, GRID * 0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    if (layer === 0 && random() < 0.12) {
      const k = Math.floor(random() * (p.length - 1))
      const [px, py] = p[k]
      glowDot(ctx, px, py, GRID * 0.12, GRID * 0.9, '157,255,187', 0.9)
    }
  }
  const LABELS = ['R', 'C', 'U', 'Q', 'L', 'D']
  ctx.font = `${Math.round(GRID * 0.7)}px monospace`
  for (const [cx, cy, cw, ch, big] of chips) {
    const x = cx * GRID, y = cy * GRID, W = cw * GRID, H = ch * GRID
    ctx.fillStyle = '#020604'
    ctx.strokeStyle = 'rgba(51,255,102,0.55)'
    ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.roundRect(x, y, W, H, GRID * 0.25); ctx.fill(); ctx.stroke()
    ctx.fillStyle = 'rgba(157,255,187,0.55)'
    for (let c = 0; c < cw; c++) { ctx.fillRect(x + c * GRID + GRID * 0.3, y - GRID * 0.35, GRID * 0.4, GRID * 0.35); ctx.fillRect(x + c * GRID + GRID * 0.3, y + H, GRID * 0.4, GRID * 0.35) }
    if (big) for (let r = 0; r < ch; r++) { ctx.fillRect(x - GRID * 0.35, y + r * GRID + GRID * 0.3, GRID * 0.35, GRID * 0.4); ctx.fillRect(x + W, y + r * GRID + GRID * 0.3, GRID * 0.35, GRID * 0.4) }
    if (big && random() < 0.5) {
      ctx.fillStyle = 'rgba(51,255,102,0.12)'
      for (let r = 1; r < ch - 1; r++) for (let c = 1; c < cw - 1; c++) { ctx.beginPath(); ctx.arc(x + c * GRID + GRID / 2, y + r * GRID + GRID / 2, GRID * 0.22, 0, Math.PI * 2); ctx.fill() }
    }
    ctx.strokeStyle = 'rgba(157,255,187,0.35)'
    ctx.beginPath(); ctx.arc(x + GRID * 0.7, y + GRID * 0.7, GRID * 0.22, 0, Math.PI * 2); ctx.stroke()
    ctx.fillStyle = 'rgba(157,255,187,0.4)'
    ctx.fillText(LABELS[Math.floor(random() * LABELS.length)] + (1 + Math.floor(random() * 40)), x, y - GRID * 0.6)
  }
  if (random() < 0.08) {
    const [cx, cy, cw, ch] = chips[0]
    ctx.fillStyle = 'rgba(51,255,102,0.85)'
    ctx.font = `700 ${Math.round(Math.min(cw, ch) * GRID * 0.38)}px monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('VV', (cx + cw / 2) * GRID, (cy + ch / 2) * GRID)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
  }
  for (let v = 0; v < 120; v++) {
    const c = Math.floor(random() * cols), r = Math.floor(random() * rows)
    if (taken[r * cols + c]) continue
    const [x, y] = at(c, r)
    ctx.strokeStyle = 'rgba(51,255,102,0.25)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.arc(x, y, GRID * 0.16, 0, Math.PI * 2); ctx.stroke()
  }
}

const BACKGROUND_STYLES = {
  galaxy: drawGalaxy,
  branches: drawWinterBranches,
  metal: drawBranchLogo,
  christmas: drawChristmasFarm,
  fern: drawFern,
  city: drawCity,
  board: drawCircuitBoard,
  mountains: drawMountains,
  dandelion: drawDandelionScene,
  underwater: drawSeafloor,
  bamboo: drawBamboo,
  waves: drawWaves,
  cherry: drawCherryBranch,
  mushrooms: drawMushrooms,
  fractal: drawFractal,
  bulbs: drawBulbs,
  meadow: drawMeadow,
  lightning: drawLightning,
  beach: drawBeach,
  openwater: drawOpenWater
}

const BACKGROUND_RARITY = { cherry: 0.15 }

function pickBackgroundStyle(random) {
  const names = Object.keys(BACKGROUND_STYLES)
  const weights = names.map((n) => BACKGROUND_RARITY[n] || 1)
  let roll = random() * weights.reduce((a, b) => a + b, 0)
  for (let i = 0; i < names.length; i++) { roll -= weights[i]; if (roll <= 0) return names[i] }
  return names[names.length - 1]
}

function drawBackground(canvas, style, seed) {
  const ctx = canvas.getContext('2d')
  const random = seededRandom(seed)
  const name = style || pickBackgroundStyle(random)
  BACKGROUND_STYLES[name](ctx, canvas.width, canvas.height, random)
  readabilityFade(ctx, canvas.width, canvas.height)
  return name
}
