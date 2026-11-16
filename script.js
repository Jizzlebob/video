const previewCanvas = document.getElementById('previewCanvas');
const previewCtx = previewCanvas.getContext('2d');
const outputCanvas = document.getElementById('mixCanvas');
const outputCtx = outputCanvas.getContext('2d');
const tracksElement = document.getElementById('tracks');
const mediaList = document.getElementById('mediaList');
const videoInput = document.getElementById('videoInput');
const importStatus = document.getElementById('importStatus');
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const supportedVideo = /\.(mp4|m4v|webm|mov|ogv|ogg|mkv|avi)$/i;
const state = {
  tracks: [], selectedId: null, strobe: 0, strobeRate: 4, fisheye: 0, crossfade: 50,
  visualizerStyle: 'bars', micGain: 12, micEnabled: false, micStream: null,
  audioContext: null, analyser: null, timeData: null, freqData: null,
  micLevel: 0, micPeak: 0, lastBeat: 0, lastAbove: false, outputWindow: null,
  screens: [], chromaEnabled: false, chromaColor: '#00ff00', chromaTolerance: 35,
  visualizerRect: { x: .1, y: .68, w: .8, h: .25 }, drag: null,
};
function status(message, error = false) { importStatus.textContent = message; importStatus.classList.toggle('error', error); }
function fitRect(video, width, height) {
  const ratio = video.videoWidth / video.videoHeight, target = width / height;
  let w = width, h = height;
  if (ratio > target) h = width / ratio; else w = height * ratio;
  return { x: (width - w) / 2, y: (height - h) / 2, w, h };
}
function backdrop(ctx, canvas) {
  const g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  g.addColorStop(0, '#171627'); g.addColorStop(.52, '#13181d'); g.addColorStop(1, '#071716);
  ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);
}
function colorRgb(hex) { return { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) }; }
function drawClip(ctx, track, canvas, mix = 1) {
  const v = track.video;
  if (!track.visible || v.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !v.videoWidth || !v.videoHeight) return;
  const rect = fitRect(v, canvas.width, canvas.height);
  const box = { x: track.x * canvas.width, y: track.y * canvas.height, w: track.w * canvas.width, h: track.h * canvas.height };
  ctx.save(); ctx.globalAlpha = track.opacity * mix;
  if (track.fisheye && state.fisheye) { ctx.translate(box.x + box.w / 2, box.y + box.h / 2); const z = 1 + state.fisheye * .45; ctx.scale(z, z); ctx.translate(-(box.x + box.w / 2), -(box.y + box.h / 2)); ctx.filter = `saturate(${1.3 + state.fisheye}) contrast(1.12)`; }
  if (state.chromaEnabled) {
    const width = Math.max(1, Math.round(v.videoWidth)), height = Math.max(1, Math.round(v.videoHeight));
    const off = track.chromaCanvas || (track.chromaCanvas = document.createElement('canvas'));
    if (off.width !== width || off.height !== height) { off.width = width; off.height = height; }
    const keyCtx = off.getContext('2d', { willReadFrequently: true });
    keyCtx.drawImage(v, 0, 0, width, height);
    try {
      const image = keyCtx.getImageData(0, 0, width, height), pixels = image.data, key = colorRgb(state.chromaColor), tol = state.chromaTolerance;
      for (let i = 0; i < pixels.length; i += 4) {
        const dr = pixels[i] - key.r, dg = pixels[i + 1] - key.g, db = pixels[i + 2] - key.b;
        if (Math.sqrt(dr * dr + dg * dg + db * db) < tol * 2.2 && pixels[i + 1] > pixels[i] * .8) pixels[i + 3] = 0;
      }
      keyCtx.putImageData(image, 0, 0);
      ctx.drawImage(off, box.x, box.y, box.w, box.h);
    } catch (error) { console.warn('Chroma Key nicht verfügbar:', error); ctx.drawImage(v, box.x, box.y, box.w, box.h); }
  } else {
    const inner = fitRect(v, box.w, box.h);
    ctx.drawImage(v, box.x + inner.x, box.y + inner.y, inner.w, inner.h);
  }
  ctx.restore();
  if (track.fisheye && state.fisheye) {
    ctx.save(); const g = ctx.createRadialGradient(box.x + box.w / 2, box.y + box.h / 2, box.h * .08, box.x + box.w / 2, box.y + box.h / 2, box.w * .65);
    g.addColorStop(.35, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${state.fisheye * .48})`); ctx.fillStyle = g; ctx.fillRect(box.x, box.y, box.w, box.h); ctx.restore();
  }
}
function drawVisualizer(ctx, canvas, time) {
  if (state.visualizerStyle === 'off') return;
  const r = state.visualizerRect, x = r.x * canvas.width, y = r.y * canvas.height, w = r.w * canvas.width, h = r.h * canvas.height;
  const data = state.freqData, count = 64, level = state.micLevel, base = y + h * .9;
  ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.lineCap = 'round';
  if (state.visualizerStyle === 'wave') {
    ctx.beginPath();
    for (let i = 0; i <= count; i++) { const px = x + i / count * w; const sample = data ? Math.abs((state.timeData[Math.floor(i / count * (state.timeData.length - 1))] - 128) / 128) : (Math.sin(time * .004 + i * .2) + 1) * .12; const py = y + h * .83 - sample * h * .75 - level * h * .2; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.shadowBlur = 14; ctx.shadowColor = '#39d9c5'; ctx.strokeStyle = '#5be9d8'; ctx.lineWidth = Math.max(2, h * .025); ctx.stroke();
  } else if (state.visualizerStyle === 'circle') {
    const cx = x + w / 2, cy = y + h / 2, radius = Math.min(w, h) * .18;
    for (let i = 0; i < count; i++) { const a = i / count * Math.PI * 2 - Math.PI / 2, value = data ? data[Math.floor(i / count * data.length)] / 255 : (Math.sin(time * .003 + i * .3) + 1) * .12, outer = radius + value * h * .4 + level * h * .15; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius); ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer); ctx.strokeStyle = i % 2 ? '#bd70ff' : '#54e6d5'; ctx.lineWidth = Math.max(2, h * .025); ctx.shadowBlur = 10; ctx.shadowColor = ctx.strokeStyle; ctx.stroke(); }
  } else {
    const bw = w / count;
    for (let i = 0; i < count; i++) { const value = data ? data[Math.floor(i / count * data.length)] / 255 : (Math.sin(time * .003 + i * .24) + 1) * .12, env = state.visualizerStyle === 'spectrum' ? Math.pow(1 - i / count, .45) : 1, bh = Math.max(h * .04, (value * .78 + level * .3) * h * env), bx = x + i * bw + bw * .16, g = ctx.createLinearGradient(0, base - bh, 0, base); g.addColorStop(0, '#ff487d'); g.addColorStop(.5, '#bd70ff'); g.addColorStop(1, '#39d9c5'); ctx.fillStyle = g; ctx.shadowBlur = 9; ctx.shadowColor = '#bd70ff'; ctx.fillRect(bx, base - bh, bw * .68, bh); }
  }
  ctx.restore();
  ctx.save(); ctx.strokeStyle = 'rgba(209,255,56,.65)'; ctx.setLineDash([9, 7]); ctx.lineWidth = Math.max(1, canvas.width / 1000); ctx.strokeRect(x, y, w, h); ctx.setLineDash([]); ctx.fillStyle = '#d1ff38'; ctx.fillRect(x + w - 12, y + h - 12, 12, 12); ctx.restore();
}
function drawStrobe(ctx, time) {
  if (!state.strobe || !state.tracks.some((t) => t.visible && t.strobe)) return;
  const period = 1000 / state.strobeRate, micPulse = state.micEnabled && time - state.lastBeat < Math.min(150, period * .7), pulse = time % period < Math.min(85, period * .28);
  if (!micPulse && !pulse) return;
  const alpha = clamp(state.strobe * (.32 + (state.micEnabled ? state.micPeak * .72 : .5)), 0, .88);
  ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = `rgba(255,255,255,${alpha})`; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.restore();
}
function renderScene(ctx, canvas, time, preview = false) {
  backdrop(ctx, canvas);
  if (preview) { const t = state.tracks.find((item) => item.id === state.selectedId); if (t) drawClip(ctx, t, canvas); else { ctx.fillStyle = '#9b9da3'; ctx.font = '600 28px system-ui'; ctx.textAlign = 'center'; ctx.fillText('Wähle einen Clip aus der Bibliothek', canvas.width / 2, canvas.height / 2); } return; }
  const visible = state.tracks.filter((t) => t.visible), a = visible.filter((t) => t.deck === 'A'), b = visible.filter((t) => t.deck === 'B'), mix = state.crossfade / 100;
  a.forEach((t) => drawClip(ctx, t, canvas, b.length ? 1 - mix : 1)); b.forEach((t) => drawClip(ctx, t, canvas, a.length ? mix : 1));
  drawVisualizer(ctx, canvas, time); drawStrobe(ctx, time);
  if (!visible.length) { ctx.fillStyle = '#929399'; ctx.font = '600 28px system-ui'; ctx.textAlign = 'center'; ctx.fillText('Clips auf Deck A oder B laden', canvas.width / 2, canvas.height / 2); }
}
function check(label, cls, track, checked) { const wrap = document.createElement('label'), input = document.createElement('input'); input.type = 'checkbox'; input.className = cls; input.dataset.id = track.id; input.checked = checked; wrap.append(input, document.createTextNode(label)); return wrap; }
function range(label, cls, track, value) { const wrap = document.createElement('label'); wrap.className = 'track-range'; wrap.append(document.createTextNode(`${label} ${Math.round(value * 100)}%`)); const input = document.createElement('input'); input.type = 'range'; input.min = '0'; input.max = '1'; input.step = '.01'; input.value = value; input.dataset.id = track.id; input.className = cls; input.setAttribute('aria-label', label); wrap.append(input); return wrap; }
function actionButton(text, action, track, title) { const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.dataset.action = action; b.dataset.id = track.id; b.title = title; return b; }
function renderTracks() {
  tracksElement.replaceChildren();
  if (!state.tracks.length) { const e = document.createElement('div'); e.className = 'empty'; e.textContent = 'Videos importieren, um Layer anzulegen.'; tracksElement.append(e); return; }
  state.tracks.forEach((t, i) => { const row = document.createElement('article'); row.className = `track${t.id === state.selectedId ? ' selected' : ''}`; const title = document.createElement('div'); title.className = 'track-title-wrap'; const n = document.createElement('span'); n.className = 'track-number'; n.textContent = String(i + 1).padStart(2, '0'); const stack = document.createElement('div'); stack.style.minWidth = '0'; const name = document.createElement('div'); name.className = 'track-title'; name.textContent = t.name; name.title = t.name; const sub = document.createElement('div'); sub.className = 'track-subtitle'; sub.textContent = `DECK ${t.deck}${t.error ? ` · ${t.error}` : ''}`; stack.append(name, sub); title.append(n, stack); const toggles = document.createElement('div'); toggles.className = 'track-toggles'; toggles.append(check('On', 'track-visible', t, t.visible), check('Strobe', 'track-strobe', t, t.strobe), check('Fish', 'track-fisheye', t, t.fisheye)); const controls = document.createElement('div'); controls.className = 'track-actions'; const deck = document.createElement('select'); deck.className = 'deck-select'; deck.dataset.id = t.id; deck.innerHTML = `<option value="A" ${t.deck === 'A' ? 'selected' : ''}>A</option><option value="B" ${t.deck === 'B' ? 'selected' : ''}>B</option>`; controls.append(deck, actionButton(t.id === state.selectedId ? 'Preview ✓' : 'Preview', 'select', t, 'Preview auswählen'), actionButton('↑', 'up', t, 'Nach vorne'), actionButton('↓', 'down', t, 'Nach hinten')); const del = actionButton('×', 'remove', t, 'Clip entfernen'); del.classList.add('delete'); controls.append(del); row.append(title, toggles, range('Deckkraft', 'track-opacity', t, t.opacity), range('Lautstärke', 'track-volume', t, t.volume), controls); tracksElement.append(row); });
}
function renderMedia() { mediaList.replaceChildren(); document.getElementById('mediaCount').textContent = state.tracks.length; if (!state.tracks.length) { const e = document.createElement('div'); e.className = 'empty'; e.textContent = 'Deine Videos erscheinen hier.'; mediaList.append(e); return; } state.tracks.forEach((t) => { const item = document.createElement('div'); item.className = `media-item${t.id === state.selectedId ? ' selected' : ''}`; item.dataset.id = t.id; const icon = document.createElement('span'); icon.className = 'media-thumb'; icon.textContent = t.error ? '!' : '▶'; const wrap = document.createElement('span'); wrap.style.minWidth = '0'; const title = document.createElement('div'); title.className = 'media-name'; title.textContent = t.name; const meta = document.createElement('div'); meta.className = 'media-meta'; meta.textContent = t.error || `DECK ${t.deck} · ${t.visible ? 'AKTIV' : 'AUS'}`; wrap.append(title, meta); item.append(icon, wrap); mediaList.append(item); }); }
function refresh() { renderTracks(); renderMedia(); }
tracksElement.addEventListener('input', (e) => { const c = e.target, t = state.tracks.find((x) => x.id === c.dataset.id); if (!t) return; if (c.classList.contains('track-visible')) t.visible = c.checked; if (c.classList.contains('track-strobe')) t.strobe = c.checked; if (c.classList.contains('track-fisheye')) t.fisheye = c.checked; if (c.classList.contains('track-opacity')) t.opacity = Number(c.value); if (c.classList.contains('track-volume')) { t.volume = Number(c.value); t.video.volume = t.volume; t.video.muted = t.volume === 0; } if (c.type === 'checkbox') refresh(); });
tracksElement.addEventListener('change', (e) => { const c = e.target, t = state.tracks.find((x) => x.id === c.dataset.id); if (c.classList.contains('deck-select') && t) { t.deck = c.value; refresh(); } });
tracksElement.addEventListener('click', (e) => { const b = e.target.closest('button[data-action]'); if (!b) return; const i = state.tracks.findIndex((t) => t.id === b.dataset.id); if (i < 0) return; if (b.dataset.action === 'remove') { const [t] = state.tracks.splice(i, 1); t.video.pause(); URL.revokeObjectURL(t.url); if (t.id === state.selectedId) state.selectedId = state.tracks[0]?.id || null; } else if (b.dataset.action === 'select') state.selectedId = state.tracks[i].id; else if (b.dataset.action === 'up' && i < state.tracks.length - 1) [state.tracks[i], state.tracks[i + 1]] = [state.tracks[i + 1], state.tracks[i]]; else if (b.dataset.action === 'down' && i > 0) [state.tracks[i], state.tracks[i - 1]] = [state.tracks[i - 1], state.tracks[i]]; refresh(); });
mediaList.addEventListener('click', (e) => { const item = e.target.closest('.media-item'); if (item) { state.selectedId = item.dataset.id; refresh(); } });
videoInput.addEventListener('change', (e) => { const files = Array.from(e.target.files || []), videos = files.filter((f) => f.type.startsWith('video/') || supportedVideo.test(f.name)); if (!videos.length) status('Keine Videodatei erkannt. MP4, WebM, MOV, OGV, MKV oder AVI wählen.', true); videos.forEach((file) => { const url = URL.createObjectURL(file), video = document.createElement('video'); video.src = url; video.loop = true; video.muted = true; video.playsInline = true; video.preload = 'auto'; video.setAttribute('playsinline', ''); video.setAttribute('webkit-playsinline', ''); const t = { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, name: file.name.replace(/\.[^/.]+$/, ''), url, video, volume: .8, opacity: 1, visible: true, strobe: true, fisheye: false, deck: state.tracks.some((x) => x.deck === 'A') ? 'B' : 'A', x: 0, y: 0, w: 1, h: 1, error: '' }; video.addEventListener('loadedmetadata', () => { status(`Geladen: ${file.name} (${video.videoWidth}×${video.videoHeight})`); video.play().catch(() => status('Clip geladen. Wiedergabe mit ▶ starten.')); }); video.addEventListener('error', () => { t.error = video.error?.code === 4 ? 'Codec nicht unterstützt' : 'Ladefehler'; status(`${file.name}: ${t.error}. MP4/H.264 oder WebM testen.`, true); refresh(); }); state.tracks.push(t); state.selectedId = t.id; video.load(); }); if (videos.length) status(`${videos.length} Video(s) werden geladen …`); refresh(); e.target.value = ''; });

const strobe = document.getElementById('strobeIntensity'), rate = document.getElementById('strobeRate'), fish = document.getElementById('fisheyeStrength'), gain = document.getElementById('visualizerGain'), visual = document.getElementById('visualizerStyle'), cross = document.getElementById('crossfader'), chroma = document.getElementById('chromaEnabled'), chromaColor = document.getElementById('chromaColor'), tolerance = document.getElementById('chromaTolerance');
function updateControls() { state.strobe = Number(strobe.value); state.strobeRate = Number(rate.value); state.fisheye = Number(fish.value); state.micGain = Number(gain.value); state.visualizerStyle = visual.value; state.crossfade = Number(cross.value); state.chromaEnabled = chroma.checked; state.chromaColor = chromaColor.value; state.chromaTolerance = Number(tolerance.value); document.getElementById('strobeValue').value = `${Math.round(state.strobe / .85 * 100)}%`; document.getElementById('rateValue').value = `${state.strobeRate} Hz`; document.getElementById('fisheyeValue').value = `${Math.round(state.fisheye * 100)}%`; document.getElementById('gainValue').value = `${state.micGain}×`; document.getElementById('crossfadeValue').value = `A ${100 - state.crossfade} / ${state.crossfade} B`; document.getElementById('chromaValue').value = state.chromaTolerance; }
[strobe, rate, fish, gain, visual, cross, chroma, chromaColor, tolerance].forEach((el) => { el.addEventListener('input', updateControls); el.addEventListener('change', updateControls); });
document.getElementById('playAll').addEventListener('click', () => state.tracks.forEach((t) => t.video.play().catch(() => {}))); document.getElementById('pauseAll').addEventListener('click', () => state.tracks.forEach((t) => t.video.pause()));
const micButton = document.getElementById('micToggle'), micHelp = document.getElementById('micHelp'), micStatus = document.getElementById('micStatus'), meter = document.getElementById('micMeterFill');
micButton.addEventListener('click', async () => { if (state.micEnabled) { state.micStream.getTracks().forEach((t) => t.stop()); await state.audioContext.close(); state.micEnabled = false; state.analyser = null; state.freqData = null; state.timeData = null; state.micLevel = 0; micButton.classList.remove('active'); micButton.innerHTML = '◉ <span>Mikrofon aktivieren</span>'; micStatus.textContent = 'MIC OFF'; return; } if (!navigator.mediaDevices?.getUserMedia) { micHelp.textContent = 'Mikrofonzugriff benötigt HTTPS oder localhost.'; return; } try { state.micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }); const AC = window.AudioContext || window.webkitAudioContext; state.audioContext = new AC(); await state.audioContext.resume(); state.analyser = state.audioContext.createAnalyser(); state.analyser.fftSize = 2048; state.analyser.smoothingTimeConstant = .5; state.analyser.minDecibels = -90; state.analyser.maxDecibels = -10; state.audioContext.createMediaStreamSource(state.micStream).connect(state.analyser); state.timeData = new Uint8Array(state.analyser.fftSize); state.freqData = new Uint8Array(state.analyser.frequencyBinCount); state.micEnabled = true; micButton.classList.add('active'); micButton.innerHTML = '◉ <span>Mikrofon deaktivieren</span>'; micStatus.textContent = 'MIC LIVE'; micHelp.textContent = 'Mikrofon aktiv. Pegelanzeige reagiert auf Eingangssignal.'; } catch (error) { micHelp.textContent = error.name === 'NotAllowedError' ? 'Mikrofon blockiert: Browser-Berechtigung erlauben.' : 'Mikrofon nicht verfügbar. HTTPS und Eingabegerät prüfen.'; } });
function updateAudio() { if (!state.analyser) { state.micLevel *= .9; state.micPeak *= .9; meter.style.width = `${state.micLevel * 100}%`; return; } state.analyser.getByteTimeDomainData(state.timeData); state.analyser.getByteFrequencyData(state.freqData); let sum = 0; for (const v of state.timeData) { const s = (v - 128) / 128; sum += s * s; } const rms = Math.sqrt(sum / state.timeData.length); const raw = clamp(Math.max(rms, state.freqData[4] / 255 * .65) * state.micGain * 5, 0, 1); state.micLevel = raw > state.micLevel ? state.micLevel * .2 + raw * .8 : state.micLevel * .78 + raw * .22; state.micPeak = Math.max(raw, state.micPeak * .9); const now = performance.now(), above = raw > .09; if (above && !state.lastAbove && now - state.lastBeat > 110) state.lastBeat = now; state.lastAbove = above; meter.style.width = `${state.micLevel * 100}%`; }

async function detectScreens() { const select = document.getElementById('monitorSelect'); if (!window.getScreenDetails) { status('Monitor-Erkennung wird von diesem Browser nicht unterstützt. Ausgabe öffnen und das Fenster auf den gewünschten Bildschirm ziehen.'); return; } try { const details = await window.getScreenDetails(); state.screens = details.screens; select.replaceChildren(); details.screens.forEach((screen, i) => { const option = document.createElement('option'); option.value = String(i); option.textContent = screen.label || `Bildschirm ${i + 1}`; select.append(option); }); status(`${details.screens.length} Bildschirm(e) erkannt.`); } catch (error) { status('Bildschirmzugriff nicht erlaubt. Erlaube „Fensterverwaltung“ in den Website-Berechtigungen oder ziehe das Ausgabe-Fenster manuell auf den Monitor.'); } }
document.getElementById('detectMonitors').addEventListener('click', detectScreens);
function openOutput() { const win = window.open('', 'vjstudio-output', 'popup,width=1280,height=760'); if (!win) { status('Popup blockiert. Popups für diese Seite erlauben.', true); return; } state.outputWindow = win; win.document.write('<!doctype html><html><head><meta charset="utf-8"><title>VJ Studio Output</title><style>*{box-sizing:border-box}body{margin:0;background:#090a0d;color:#aaa;font:11px system-ui}header{height:30px;padding:7px 12px;background:#191a1e;letter-spacing:.12em}canvas{width:100vw;height:calc(100vh - 30px);display:block;touch-action:none}</style></head><body><header>VJ STUDIO · PROGRAM OUTPUT · Drag: Layer/Visualizer bewegen</header><canvas id="out" width="1280" height="720"></canvas></body></html>'); win.document.close(); const screen = state.screens[Number(document.getElementById('monitorSelect').value)]; if (screen) { try { win.moveTo(screen.availLeft, screen.availTop); win.resizeTo(screen.availWidth, screen.availHeight); } catch (error) { console.info(error); } } const external = win.document.getElementById('out'); attachDrag(external); }
document.getElementById('openOutput').addEventListener('click', openOutput); document.getElementById('fullscreenOutput').addEventListener('click', () => { const win = state.outputWindow && !state.outputWindow.closed ? state.outputWindow : window; win.document.documentElement.requestFullscreen?.().catch(() => {}); });

function pointOnCanvas(event, canvas) { const r = canvas.getBoundingClientRect(); return { x: (event.clientX - r.left) / r.width, y: (event.clientY - r.top) / r.height }; }
function attachDrag(canvas) {
  canvas.addEventListener('pointerdown', (event) => { const p = pointOnCanvas(event, canvas), r = state.visualizerRect; const inViz = state.visualizerStyle !== 'off' && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; if (inViz) { state.drag = { type: 'visualizer', resize: p.x > r.x + r.w - .025 && p.y > r.y + r.h - .025, dx: p.x - r.x, dy: p.y - r.y, w: r.w, h: r.h }; canvas.setPointerCapture?.(event.pointerId); event.preventDefault(); return; } const track = [...state.tracks].reverse().find((t) => t.visible && p.x >= t.x && p.x <= t.x + t.w && p.y >= t.y && p.y <= t.y + t.h); if (track) { state.selectedId = track.id; state.drag = { type: 'track', id: track.id, resize: p.x > track.x + track.w - .025 && p.y > track.y + track.h - .025, dx: p.x - track.x, dy: p.y - track.y, w: track.w, h: track.h }; refresh(); canvas.setPointerCapture?.(event.pointerId); event.preventDefault(); } });
  canvas.addEventListener('pointermove', (event) => { if (!state.drag) return; const p = pointOnCanvas(event, canvas), d = state.drag; if (d.type === 'visualizer') { if (d.resize) { state.visualizerRect.w = clamp(p.x - state.visualizerRect.x, .12, 1 - state.visualizerRect.x); state.visualizerRect.h = clamp(p.y - state.visualizerRect.y, .08, 1 - state.visualizerRect.y); } else { state.visualizerRect.x = clamp(p.x - d.dx, 0, 1 - state.visualizerRect.w); state.visualizerRect.y = clamp(p.y - d.dy, 0, 1 - state.visualizerRect.h); } } else { const t = state.tracks.find((item) => item.id === d.id); if (!t) return; if (d.resize) { t.w = clamp(p.x - t.x, .12, 1 - t.x); t.h = clamp(p.y - t.y, .08, 1 - t.y); } else { t.x = clamp(p.x - d.dx, 0, 1 - t.w); t.y = clamp(p.y - d.dy, 0, 1 - t.h); } } });
  canvas.addEventListener('pointerup', () => { state.drag = null; }); canvas.addEventListener('pointercancel', () => { state.drag = null; });
}
attachDrag(outputCanvas);
function animate(time) { updateAudio(); renderScene(previewCtx, previewCanvas, time, true); renderScene(outputCtx, outputCanvas, time); if (state.outputWindow && !state.outputWindow.closed) { const c = state.outputWindow.document.getElementById('out'); if (c) c.getContext('2d').drawImage(outputCanvas, 0, 0, c.width, c.height); } else if (state.outputWindow?.closed) state.outputWindow = null; const selected = state.tracks.find((t) => t.id === state.selectedId); document.getElementById('previewLabel').textContent = selected?.name || 'Clip auswählen'; document.getElementById('outputLabel').textContent = `${state.tracks.filter((t) => t.visible).length} Ebenen`; requestAnimationFrame(animate); }
document.addEventListener('keydown', (event) => { if (event.code !== 'Space' || ['INPUT', 'SELECT', 'BUTTON'].includes(document.activeElement.tagName)) return; event.preventDefault(); const t = state.tracks.find((item) => item.id === state.selectedId); if (t) { if (t.video.paused) t.video.play().catch(() => {}); else t.video.pause(); } });
updateControls(); renderTracks(); renderMedia(); attachDrag;
requestAnimationFrame(animate);
