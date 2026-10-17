const LOGO_WIDTH = 1200
const LOGO_HEIGHT = 540
const LOGO_GROUND = '#010302'

function paintLogo(stage, seed, w, h) {
  const art = document.createElement('canvas')
  art.width = LOGO_WIDTH
  art.height = LOGO_HEIGHT
  drawBackground(art, 'metal', seed)
  const ctx = stage.getContext('2d')
  ctx.fillStyle = LOGO_GROUND
  ctx.fillRect(0, 0, w, h)
  const sideways = h > w
  const across = sideways ? LOGO_HEIGHT : LOGO_WIDTH
  const down = sideways ? LOGO_WIDTH : LOGO_HEIGHT
  const scale = Math.min(w / across, h / down)
  ctx.save()
  ctx.translate(w / 2, h / 2)
  if (sideways) ctx.rotate(Math.PI / 2)
  ctx.scale(scale, scale)
  ctx.drawImage(art, -LOGO_WIDTH / 2, -LOGO_HEIGHT / 2)
  ctx.restore()
}

function paintStage(stage, seed, w, h) {
  stage.width = w
  stage.height = h
  const style = pickBackgroundStyle(seededRandom(seed))
  if (style === 'metal') paintLogo(stage, seed, w, h)
  else drawBackground(stage, style, seed)
  return style
}
