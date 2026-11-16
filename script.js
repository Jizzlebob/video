const previewCanvas = document.getElementById('previewCanvas');
const previewCtx = previewCanvas.getContext('2d');
const outputCanvas = document.getElementById('mixCanvas');
const outputCtx = outputCanvas.getContext('2d');
const tracksElement = document.getElementById('tracks');
const mediaList = document.getElementById('mediaList');
const videoInput = document.getElementById('videoInput');
const importStatus = document.getElementById('importStatus');

const state = {
  tracks: [], selectedId: null, strobe: 0, strobeRate: 4, fisheye: 0,
  crossfade: 50, visualizerStyle: 'bars', micGain: 8, micEnabled: false,
  micStream: null, audioContext: null, analyser: null, timeData: null,
  freqData: null, micLevel: 0, micPeak: 0, lastBeat: 0, lastAbove: false,
  outputWindow: null, screens: [],
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const supportedVideo = /\.(mp4|m4v|webm|mov|ogv|ogg|mkv|avi)$/i;

function setImportStatus(message, isError = false) {
  if (!importStatus) return;
  importStatus.textContent = message;
  importStatus.classList.toggle('error', isError);
}

function fitRect(video, width, height) {
  const ratio = video.videoWidth / video.videoHeight;
  const target = width / height;
  let drawWidth = width;
  let drawHeight = height;
  if (ratio > target) drawHeight = width / ratio;
  else drawWidth = height * ratio;
  return { x: (width - drawWidth) / 2, y: (height - drawHeight) / 2, width: drawWidth, height: drawHeight };
}

function backdrop(ctx, canvas) {
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#171627'); gradient.addColorStop(.52, '#13181d'); gradient.addColorStop(1, '#071716');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawClip(ctx, track, canvas, mix = 1) {
  const video = track.video;
  if (!track.visible || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) return;
  const rect = fitRect(video, canvas.width, canvas.height);
  const cx = canvas.width / 2; const cy = canvas.height / 2;
  ctx.save();
  ctx.globalAlpha = track.opacity * mix;
  const zoom = 1 + (track.fisheye ? state.fisheye * .45 : 0);
  ctx.translate(cx, cy); ctx.scale(zoom, zoom); ctx.translate(-cx, -cy);
  ctx.filter = track.fisheye ? `saturate(${1.3 + state.fisheye}) contrast(1.12)` : 'none';
  ctx.drawImage(video, rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
  if (track.fisheye && state.fisheye > 0) {
    ctx.save(); ctx.globalAlpha = track.opacity * mix;
    const vignette = ctx.createRadialGradient(cx, cy, canvas.height * .08, cx, cy, canvas.width * .65);
    vignette.addColorStop(.35, 'rgba(0,0,0,0)'); vignette.addColorStop(1, `rgba(0,0,0,${state.fisheye * .5})`);
    ctx.fillStyle = vignette; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.restore();
  }
}

function drawVisualizer(ctx, width, height, time) {
  const data = state.freqData; const count = 64; const base = height * .91; const level = state.micLevel;
  ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.lineCap = 'round';
  if (state.visualizerStyle === 'wave') {
    ctx.beginPath();
    for (let i = 0; i <= count; i += 1) {
      const x = i / count * width;
      const sample = data ? Math.abs((state.timeData[Math.floor(i / count * (state.timeData.length - 1))] - 128) / 128) : (Math.sin(time * .004 + i * .2) + 1) * .12;
      const y = height * .83 - sample * height * .42 - level * height * .13;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.shadowBlur = 14; ctx.shadowColor = '#39d9c5'; ctx.strokeStyle = '#5be9d8'; ctx.lineWidth = Math.max(2, height * .006); ctx.stroke();
  } else if (state.visualizerStyle === 'circle') {
    const cx = width / 2; const cy = height / 2; const radius = Math.min(width, height) * .17;
    for (let i = 0; i < count; i += 1) {
      const angle = i / count * Math.PI * 2 - Math.PI / 2;
      const value = data ? data[Math.floor(i / count * data.length)] / 255 : (Math.sin(time * .003 + i * .3) + 1) * .12;
      const outer = radius + value * height * .28 + level * height * .1;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius); ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
      ctx.strokeStyle = i % 2 ? '#bd70ff' : '#54e6d5'; ctx.lineWidth = Math.max(2, height * .006); ctx.shadowBlur = 10; ctx.shadowColor = ctx.strokeStyle; ctx.stroke();
    }
  } else {
    const barWidth = width / count;
    for (let i = 0; i < count; i += 1) {
      const value = data ? data[Math.floor(i / count * data.length)] / 255 : (Math.sin(time * .003 + i * .24) + 1) * .12;
      const envelope = state.visualizerStyle === 'spectrum' ? Math.pow(1 - i / count, .45) : 1;
      const barHeight = Math.max(height * .01, (value * .78 + level * .2) * height * envelope);
      const x = i * barWidth + barWidth * .16;
      const gradient = ctx.createLinearGradient(0, base - barHeight, 0, base);
      gradient.addColorStop(0, '#ff487d'); gradient.addColorStop(.5, '#bd70ff'); gradient.addColorStop(1, '#39d9c5');
      ctx.fillStyle = gradient; ctx.shadowBlur = 9; ctx.shadowColor = '#bd70ff'; ctx.fillRect(x, base - barHeight, barWidth * .68, barHeight);
    }
  }
  ctx.restore();
}

function drawStrobe(ctx, time) {
  if (!state.strobe || !state.tracks.some((track) => track.visible && track.strobe)) return;
  const period = 1000 / state.strobeRate;
  const beat = state.micEnabled && time - state.lastBeat < Math.min(110, period * .5);
  const pulse = time % period < Math.min(70, period * .2);
  if (!beat && !pulse) return;
  const alpha = clamp(state.strobe * (.15 + (state.micEnabled ? state.micPeak * .42 : .18)), 0, .55);
  ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = `rgba(255,255,255,${alpha})`; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.restore();
}

function renderScene(ctx, canvas, time, preview = false) {
  backdrop(ctx, canvas);
  if (preview) {
    const track = state.tracks.find((item) => item.id === state.selectedId);
    if (track) drawClip(ctx, track, canvas);
    else { ctx.fillStyle = '#9b9da3'; ctx.font = '600 28px system-ui'; ctx.textAlign = 'center'; ctx.fillText('Wähle einen Clip aus der Bibliothek', canvas.width / 2, canvas.height / 2); }
    return;
  }
  const visible = state.tracks.filter((track) => track.visible);
  const deckA = visible.filter((track) => track.deck === 'A');
  const deckB = visible.filter((track) => track.deck === 'B');
  const bMix = state.crossfade / 100;
  deckA.forEach((track) => drawClip(ctx, track, canvas, deckB.length ? 1 - bMix : 1));
  deckB.forEach((track) => drawClip(ctx, track, canvas, deckA.length ? bMix : 1));
  if (state.visualizerStyle !== 'off') drawVisualizer(ctx, canvas.width, canvas.height, time);
  drawStrobe(ctx, time);
  if (!visible.length) { ctx.fillStyle = '#929399'; ctx.font = '600 28px system-ui'; ctx.textAlign = 'center'; ctx.fillText('Clips auf Deck A oder B laden', canvas.width / 2, canvas.height / 2); }
}

function createCheck(text, className, track, checked) {
  const label = document.createElement('label'); const input = document.createElement('input');
  input.type = 'checkbox'; input.className = className; input.dataset.id = track.id; input.checked = checked;
  label.append(input, document.createTextNode(text)); return label;
}
function createRange(labelText, className, track, value) {
  const label = document.createElement('label'); label.className = 'track-range'; label.append(document.createTextNode(`${labelText} ${Math.round(value * 100)}%`));
  const input = document.createElement('input'); input.type = 'range'; input.min = '0'; input.max = '1'; input.step = '.01'; input.value = value; input.dataset.id = track.id; input.className = className; input.setAttribute('aria-label', labelText); label.append(input); return label;
}
function createButton(text, action, track, title) {
  const button = document.createElement('button'); button.type = 'button'; button.textContent = text; button.dataset.action = action; button.dataset.id = track.id; button.title = title; return button;
}

function renderTracks() {
  tracksElement.replaceChildren();
  if (!state.tracks.length) { const empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = 'Videos importieren, um Layer anzulegen.'; tracksElement.append(empty); return; }
  state.tracks.forEach((track, index) => {
    const row = document.createElement('article'); row.className = `track${track.id === state.selectedId ? ' selected' : ''}`;
    const title = document.createElement('div'); title.className = 'track-title-wrap';
    const number = document.createElement('span'); number.className = 'track-number'; number.textContent = String(index + 1).padStart(2, '0');
    const stack = document.createElement('div'); stack.style.minWidth = '0';
    const name = document.createElement('div'); name.className = 'track-title'; name.textContent = track.name; name.title = track.name;
    const subtitle = document.createElement('div'); subtitle.className = 'track-subtitle'; subtitle.textContent = `DECK ${track.deck}${track.error ? ' · Ladefehler' : ''}`;
    stack.append(name, subtitle); title.append(number, stack);
    const toggles = document.createElement('div'); toggles.className = 'track-toggles';
    toggles.append(createCheck('On', 'track-visible', track, track.visible), createCheck('Strobe', 'track-strobe', track, track.strobe), createCheck('Fish', 'track-fisheye', track, track.fisheye));
    const opacity = createRange('Deckkraft', 'track-opacity', track, track.opacity);
    const volume = createRange('Lautstärke', 'track-volume', track, track.volume);
    const order = document.createElement('div'); order.className = 'track-order'; order.append(createButton('↑', 'up', track, 'Nach vorne'), createButton('↓', 'down', track, 'Nach hinten'));
    const actions = document.createElement('div'); actions.className = 'track-actions';
    const deck = document.createElement('select'); deck.className = 'deck-select'; deck.dataset.action = 'deck'; deck.dataset.id = track.id;
    deck.innerHTML = `<option value="A" ${track.deck === 'A' ? 'selected' : ''}>Deck A</option><option value="B" ${track.deck === 'B' ? 'selected' : ''}>Deck B</option>`;
    actions.append(deck, createButton(track.id === state.selectedId ? 'Preview ✓' : 'Preview', 'select', track, 'Preview auswählen'));
    const remove = createButton('×', 'remove', track, 'Clip entfernen'); remove.classList.add('delete'); actions.append(remove);
    row.append(title, toggles, opacity, volume, order, actions); tracksElement.append(row);
  });
}

function renderMedia() {
  mediaList.replaceChildren(); document.getElementById('mediaCount').textContent = state.tracks.length;
  if (!state.tracks.length) { const empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = 'Deine Videos erscheinen hier.'; mediaList.append(empty); return; }
  state.tracks.forEach((track) => {
    const item = document.createElement('div'); item.className = `media-item${track.id === state.selectedId ? ' selected' : ''}`; item.dataset.id = track.id;
    const thumb = document.createElement('span'); thumb.className = 'media-thumb'; thumb.textContent = track.error ? '!' : '▶';
    const wrap = document.createElement('span'); wrap.style.minWidth = '0';
    const title = document.createElement('div'); title.className = 'media-name'; title.textContent = track.name;
    const meta = document.createElement('div'); meta.className = 'media-meta'; meta.textContent = track.error || `DECK ${track.deck} · ${track.visible ? 'AKTIV' : 'AUS'}`;
    wrap.append(title, meta); item.append(thumb, wrap); mediaList.append(item);
  });
}
function refresh() { renderTracks(); renderMedia(); }

tracksElement.addEventListener('input', (event) => {
  const control = event.target; const track = state.tracks.find((item) => item.id === control.dataset.id); if (!track) return;
  if (control.classList.contains('track-visible')) track.visible = control.checked;
  if (control.classList.contains('track-strobe')) track.strobe = control.checked;
  if (control.classList.contains('track-fisheye')) track.fisheye = control.checked;
  if (control.classList.contains('track-opacity')) track.opacity = Number(control.value);
  if (control.classList.contains('track-volume')) { track.volume = Number(control.value); track.video.volume = track.volume; track.video.muted = track.volume === 0; }
  if (control.type === 'checkbox') refresh();
});
tracksElement.addEventListener('change', (event) => {
  const control = event.target;
  if (control.classList.contains('deck-select')) { const track = state.tracks.find((item) => item.id === control.dataset.id); if (track) { track.deck = control.value; refresh(); } }
});
tracksElement.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]'); if (!button) return;
  const index = state.tracks.findIndex((track) => track.id === button.dataset.id); if (index < 0) return;
  const action = button.dataset.action;
  if (action === 'remove') { const [track] = state.tracks.splice(index, 1); track.video.pause(); URL.revokeObjectURL(track.url); if (track.id === state.selectedId) state.selectedId = state.tracks[0]?.id || null; }
  else if (action === 'select') state.selectedId = state.tracks[index].id;
  else if (action === 'up' && index < state.tracks.length - 1) [state.tracks[index], state.tracks[index + 1]] = [state.tracks[index + 1], state.tracks[index]];
  else if (action === 'down' && index > 0) [state.tracks[index], state.tracks[index - 1]] = [state.tracks[index - 1], state.tracks[index]];
  refresh();
});
mediaList.addEventListener('click', (event) => { const item = event.target.closest('.media-item'); if (item) { state.selectedId = item.dataset.id; refresh(); } });

videoInput.addEventListener('change', (event) => {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;
  // Some browsers provide an empty or generic MIME type for valid local video files;
  // use the filename extension as a fallback instead of silently discarding them.
  const videos = files.filter((file) => file.type.startsWith('video/') || supportedVideo.test(file.name));
  const rejected = files.length - videos.length;
  videos.forEach((file) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.src = url; video.loop = true; video.muted = true; video.playsInline = true; video.preload = 'auto';
    video.setAttribute('playsinline', ''); video.setAttribute('webkit-playsinline', '');
    const track = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, name: file.name.replace(/\.[^/.]+$/, ''),
      url, video, volume: .8, opacity: 1, visible: true, strobe: false, fisheye: false,
      deck: state.tracks.some((item) => item.deck === 'A') ? 'B' : 'A', error: '',
    };
    video.addEventListener('loadedmetadata', () => {
      setImportStatus(`Geladen: ${file.name} (${video.videoWidth}×${video.videoHeight})`);
      video.play().catch((error) => {
        console.warn('Autoplay wurde verhindert; starte den Clip per Play:', error);
        setImportStatus(`Clip geladen. Falls er nicht läuft, klicke ▶ oder erlaube die Wiedergabe.`);
      });
    }, { once: true });
    video.addEventListener('error', () => {
      const code = video.error?.code;
      const message = code === 4 ? 'Codec nicht unterstützt (MP4/H.264 oder WebM probieren).' : 'Datei konnte nicht gelesen werden.';
      track.error = message; setImportStatus(`${file.name}: ${message}`, true); refresh();
    });
    state.tracks.push(track); state.selectedId = track.id;
    // load() ensures the selected local File is fetched by the media element.
    video.load();
  });
  if (!videos.length) setImportStatus('Keine Videodatei erkannt. MP4, WebM, MOV, OGV, MKV oder AVI auswählen.', true);
  else if (rejected) setImportStatus(`${videos.length} Video(s) hinzugefügt; ${rejected} Datei(en) übersprungen.`);
  else setImportStatus(`${videos.length} Video(s) werden geladen …`);
  refresh(); event.target.value = '';
});

const strobe = document.getElementById('strobeIntensity'); const rate = document.getElementById('strobeRate');
const fish = document.getElementById('fisheyeStrength'); const gain = document.getElementById('visualizerGain');
const visual = document.getElementById('visualizerStyle'); const cross = document.getElementById('crossfader');
function updateControls() {
  state.strobe = Number(strobe.value); state.strobeRate = Number(rate.value); state.fisheye = Number(fish.value);
  state.micGain = Number(gain.value); state.visualizerStyle = visual.value; state.crossfade = Number(cross.value);
  document.getElementById('strobeValue').value = `${Math.round(state.strobe / .6 * 100)}%`;
  document.getElementById('rateValue').value = `${state.strobeRate} Hz`;
  document.getElementById('fisheyeValue').value = `${Math.round(state.fisheye * 100)}%`;
  document.getElementById('gainValue').value = `${state.micGain}×`;
  document.getElementById('crossfadeValue').value = `A ${100 - state.crossfade} / ${state.crossfade} B`;
}
[strobe, rate, fish, gain, visual, cross].forEach((input) => { input.addEventListener('input', updateControls); input.addEventListener('change', updateControls); });
document.getElementById('playAll').addEventListener('click', () => state.tracks.forEach((track) => track.video.play().catch(() => {})));
document.getElementById('pauseAll').addEventListener('click', () => state.tracks.forEach((track) => track.video.pause()));

const micButton = document.getElementById('micToggle'); const micHelp = document.getElementById('micHelp'); const micStatus = document.getElementById('micStatus'); const meter = document.getElementById('micMeterFill');
micButton.addEventListener('click', async () => {
  if (state.micEnabled) {
    state.micStream.getTracks().forEach((track) => track.stop()); await state.audioContext.close();
    state.micEnabled = false; state.analyser = null; state.freqData = null; state.timeData = null; state.micLevel = 0;
    micButton.classList.remove('active'); micButton.innerHTML = '◉ <span>Mikrofon aktivieren</span>'; micStatus.textContent = 'MIC OFF'; return;
  }
  if (!navigator.mediaDevices?.getUserMedia) { micHelp.textContent = 'Mikrofonzugriff benötigt HTTPS oder localhost.'; return; }
  try {
    state.micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    state.audioContext = new AudioContextClass(); await state.audioContext.resume();
    state.analyser = state.audioContext.createAnalyser(); state.analyser.fftSize = 2048; state.analyser.smoothingTimeConstant = .65;
    state.audioContext.createMediaStreamSource(state.micStream).connect(state.analyser);
    state.timeData = new Uint8Array(state.analyser.fftSize); state.freqData = new Uint8Array(state.analyser.frequencyBinCount);
    state.micEnabled = true; micButton.classList.add('active'); micButton.innerHTML = '◉ <span>Mikrofon deaktivieren</span>'; micStatus.textContent = 'MIC LIVE';
    micHelp.textContent = 'Mikrofon aktiv. Sprich oder spiele Musik ab, um den Pegel zu testen.';
  } catch (error) { micHelp.textContent = error.name === 'NotAllowedError' ? 'Mikrofon blockiert: Berechtigung in den Browser-Einstellungen erlauben.' : 'Mikrofon nicht verfügbar. HTTPS-Verbindung und Eingabegerät prüfen.'; }
});

function updateAudio() {
  if (!state.analyser) { state.micLevel *= .9; state.micPeak *= .9; meter.style.width = `${state.micLevel * 100}%`; return; }
  state.analyser.getByteTimeDomainData(state.timeData); state.analyser.getByteFrequencyData(state.freqData);
  let sum = 0; for (const value of state.timeData) { const sample = (value - 128) / 128; sum += sample * sample; }
  const rms = Math.sqrt(sum / state.timeData.length); const raw = clamp(rms * state.micGain * 4, 0, 1);
  state.micLevel = raw > state.micLevel ? state.micLevel * .35 + raw * .65 : state.micLevel * .86 + raw * .14;
  state.micPeak = Math.max(raw, state.micPeak * .92);
  const now = performance.now(); const above = raw > .13;
  if (above && !state.lastAbove && now - state.lastBeat > 140) state.lastBeat = now;
  state.lastAbove = above; meter.style.width = `${state.micLevel * 100}%`;
}

async function detectScreens() {
  if (!window.getScreenDetails) return;
  try {
    const details = await window.getScreenDetails(); state.screens = details.screens;
    const select = document.getElementById('monitorSelect'); select.replaceChildren();
    details.screens.forEach((screen, index) => { const option = document.createElement('option'); option.value = index; option.textContent = screen.label || `Bildschirm ${index + 1}`; select.append(option); });
  } catch (error) { console.warn('Monitorliste nicht verfügbar:', error); }
}
document.getElementById('detectMonitors').addEventListener('click', detectScreens);
function openOutput() {
  const win = window.open('', 'vjstudio-output', 'popup,width=1280,height=760');
  if (!win) { setImportStatus('Popup blockiert. Erlaube Popups für das Ausgabe-Fenster.', true); return; }
  state.outputWindow = win;
  win.document.write('<!doctype html><html><head><meta charset="utf-8"><title>VJ Studio Output</title><style>*{box-sizing:border-box}body{margin:0;background:#090a0d;color:#aaa;font:11px system-ui}header{height:30px;padding:7px 12px;background:#191a1e;letter-spacing:.12em}canvas{width:100vw;height:calc(100vh - 30px);display:block}</style></head><body><header>VJ STUDIO · PROGRAM OUTPUT</header><canvas id="out" width="1280" height="720"></canvas></body></html>');
  win.document.close(); const screen = state.screens[Number(document.getElementById('monitorSelect').value)];
  if (screen) { try { win.moveTo(screen.availLeft, screen.availTop); win.resizeTo(screen.availWidth, screen.availHeight); } catch (error) { console.info(error); } }
}
document.getElementById('openOutput').addEventListener('click', openOutput);
document.getElementById('fullscreenOutput').addEventListener('click', () => { const win = state.outputWindow && !state.outputWindow.closed ? state.outputWindow : window; win.document.documentElement.requestFullscreen?.().catch(() => {}); });

function animate(time) {
  updateAudio(); renderScene(previewCtx, previewCanvas, time, true); renderScene(outputCtx, outputCanvas, time, false);
  if (state.outputWindow && !state.outputWindow.closed) { const canvas = state.outputWindow.document.getElementById('out'); if (canvas) canvas.getContext('2d').drawImage(outputCanvas, 0, 0, canvas.width, canvas.height); }
  else if (state.outputWindow?.closed) state.outputWindow = null;
  const selected = state.tracks.find((track) => track.id === state.selectedId);
  document.getElementById('previewLabel').textContent = selected?.name || 'Clip auswählen';
  document.getElementById('outputLabel').textContent = `${state.tracks.filter((track) => track.visible).length} Ebenen`;
  requestAnimationFrame(animate);
}
document.addEventListener('keydown', (event) => {
  if (event.code !== 'Space' || ['INPUT', 'SELECT', 'BUTTON'].includes(document.activeElement.tagName)) return;
  event.preventDefault(); const track = state.tracks.find((item) => item.id === state.selectedId);
  if (track) (track.video.paused ? track.video.play() : Promise.resolve()).catch?.(() => {});
});
updateControls(); renderTracks(); renderMedia(); requestAnimationFrame(animate);
