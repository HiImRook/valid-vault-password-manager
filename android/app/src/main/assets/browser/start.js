const MAX_SCALE = 1.5
const WORKER_HEAD = 'self.document={createElement:function(){return new OffscreenCanvas(1,1)}};\n'
const WORKER_TAIL = '\nself.onmessage=function(e){var m=e.data;if(m.canvas){self.stage=m.canvas;return}'
  + 'if(m.exportId!==undefined){if(!self.stage){self.postMessage({exportId:m.exportId,error:true});return}'
  + 'self.stage.convertToBlob({type:"image/png"}).then(function(b){return b.arrayBuffer()}).then(function(buf){self.postMessage({exportId:m.exportId,png:buf},[buf])})'
  + '.catch(function(){self.postMessage({exportId:m.exportId,error:true})});return}'
  + 'var style=paintStage(self.stage,m.seed,m.w,m.h);self.postMessage({key:m.key,style:style})};'
let stage = document.getElementById('stage')
let worker = null
let currentSeed = null
let requestedKey = null
let lastStyle = ''
let paintedKey = null
let exportResult = null
const BASE64_CHUNK = 32768

function freshStage() {
  const replacement = document.createElement('canvas')
  replacement.id = 'stage'
  stage.replaceWith(replacement)
  stage = replacement
}

function dropWorker() {
  if (worker) worker.terminate()
  worker = null
  freshStage()
  requestedKey = null
  if (currentSeed !== null) paintStart(currentSeed)
}

function startWorker() {
  if (typeof OffscreenCanvas === 'undefined' || typeof Worker === 'undefined' || !stage.transferControlToOffscreen) return
  try {
    const source = WORKER_HEAD + document.getElementById('art').textContent + '\n' + document.getElementById('paint').textContent + WORKER_TAIL
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
    const created = new Worker(url)
    const offscreen = stage.transferControlToOffscreen()
    created.postMessage({ canvas: offscreen }, [offscreen])
    created.onmessage = (e) => {
      if (e.data.exportId !== undefined) {
        exportResult = e.data.error ? { id: e.data.exportId, error: true } : { id: e.data.exportId, data: toBase64(e.data.png), style: lastStyle }
        return
      }
      lastStyle = e.data.style
      paintedKey = e.data.key
    }
    created.onerror = () => { if (worker === created) dropWorker() }
    worker = created
  } catch (e) {
    worker = null
    freshStage()
  }
}

function stageSize() {
  const scale = Math.min(window.devicePixelRatio || 1, MAX_SCALE)
  return [Math.max(1, Math.round(window.innerWidth * scale)), Math.max(1, Math.round(window.innerHeight * scale))]
}

function paintStart(seed) {
  currentSeed = seed
  const [w, h] = stageSize()
  const key = seed + ':' + w + 'x' + h
  if (key === requestedKey) return 'same'
  requestedKey = key
  if (worker) {
    worker.postMessage({ seed, w, h, key })
    return 'worker'
  }
  lastStyle = paintStage(stage, seed, w, h)
  paintedKey = key
  return lastStyle
}

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let text = ''
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) text += String.fromCharCode.apply(null, bytes.subarray(i, i + BASE64_CHUNK))
  return btoa(text)
}

function exportStart(id) {
  exportResult = null
  if (worker) {
    worker.postMessage({ exportId: id })
    return 'worker'
  }
  try {
    const url = stage.toDataURL('image/png')
    exportResult = { id, data: url.slice(url.indexOf(',') + 1), style: lastStyle }
  } catch (e) {
    exportResult = { id, error: true }
  }
  return 'main'
}

function takeExport(id) {
  if (!exportResult || exportResult.id !== id) return null
  const result = exportResult
  exportResult = null
  return result
}

window.addEventListener('resize', () => {
  if (currentSeed !== null) paintStart(currentSeed)
})

startWorker()
