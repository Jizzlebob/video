const previewCanvas = document.getElementById('previewCanvas');
const previewCtx = previewCanvas.getContext('2d');
const outputCanvas = document.getElementById('mixCanvas');
const outputCtx = outputCanvas.getContext('2d');
const tracksContainer = document.getElementById('tracks');
const videoInput = document.getElementById('videoInput');
const strobeIntensityInput = document.getElementById('strobeIntensity');
const strobeRateInput = document.getElementById('strobeRate');
const fisheyeStrengthInput = document.getElementById('fisheyeStrength');
const visualizerGainInput = document.getElementById('visualizerGain');
const visualizerStyleInput = document.getElementById('visualizerStyle');
const micToggleButton = document.getElementById('micToggle');
const micMeterFill = document.getElementById('micMeterFill');
const micStatus = document.getElementById('micStatus');
const micHelp = document.getElementById('micHelp');
const monitorSelect = document.getElementById('monitorSelect');
const monitorHelp = document.getElementById('monitorHelp');
const previewLabel = document.getElementById('previewLabel');
const outputLabel = document.getElementById('outputLabel');
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const state = {
  tracks: [], selectedId: null,
  strobeIntensity: Number(strobeIntensityInput.value), strobeRate: Number(strobeRateInput.value),
  fisheyeStrength: Number(fisheyeStrengthInput.value), visualizerGain: Number(visualizerGainInput.value),
  visualizerStyle: visualizerStyleInput.value, micLevel: 0, micPeak: 0, previousLevel: 0, lastBeat: 0,
  micEnabled: false, audioContext: null, analyser: null, micStream: null, timeData: null, frequencyData: null,
  outputWindow: null, screens: [], selectedScreen: null,
};

function drawBackdrop(context, canvas) {
  context.save();
  context.clearRect(0, 0, canvas.width, canvas.height);
  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#11152a'); gradient.addColorStop(0.55, '#111827'); gradient.addColorStop(1, '#07151c');
  context.fillStyle = gradient; context.fillRect(0, 0, canvas.width, canvas.height);
  const glow = context.createRadialGradient(canvas.width * .78, canvas.height * .18, 0, canvas.width * .78, canvas.height * .18, canvas.width * .7);
  glow.addColorStop(0, 'rgba(126,68,205,.17)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = glow; context.fillRect(0, 0, canvas.width, canvas.height);
  context.restore();
}

function fitRect(video, x, y, width, height) {
  const sourceRatio = video.videoWidth / video.videoHeight;
  const targetRatio = width / height;
  let drawWidth = width; let drawHeight = height;
  if (sourceRatio > targetRatio) drawHeight = width / sourceRatio;
  else drawWidth = height * sourceRatio;
  return { x: x + (width - drawWidth) / 2, y: y + (height - drawHeight) / 2, width: drawWidth, height: drawHeight };
}

function renderVisualizer(context, width, height, time) {
  const style = state.visualizerStyle;
  const data = state.frequencyData;
  const level = state.micLevel;
  const count = 64;
  const baseY = height * .9;
  context.save();
  context.globalCompositeOperation = 'screen';
  context.lineCap = 'round';
  if (style === 'wave') {
    context.beginPath();
    for (let i = 0; i <= count; i += 1) {
      const x = (i / count) * width;
      const bin = data ? data[Math.floor(i / count * data.length)] / 255 : 0;
      const oscillation = data ? bin : Math.sin(time * .004 + i * .2) * .25;
      const y = height * .82 - oscillation * (height * .46) - level * height * .15;
      if (i === 0) context.moveTo(x, y); else context.lineTo(x, y);
    }
    context.shadowBlur = 18; context.shadowColor = '#4de2de'; context.strokeStyle = 'rgba(77,226,222,.95)'; context.lineWidth = Math.max(2, height * .006); context.stroke();
  } else if (style === 'circle') {
    const cx = width / 2; const cy = height / 2; const base = Math.min(width, height) * .2;
    for (let i = 0; i < count; i += 1) {
      const angle = i / count * Math.PI * 2 - Math.PI / 2;
      const bin = data ? data[Math.floor(i / count * data.length)] / 255 : (Math.sin(time * .004 + i * .3) + 1) * .15;
      const outer = base + bin * height * .23 + level * height * .08;
      context.beginPath(); context.moveTo(cx + Math.cos(angle) * base, cy + Math.sin(angle) * base); context.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
      context.strokeStyle = i % 2 ? '#a66bff' : '#4de2de'; context.lineWidth = Math.max(2, height * .006); context.shadowBlur = 12; context.shadowColor = context.strokeStyle; context.stroke();
    }
    context.beginPath(); context.arc(cx, cy, base * .72, 0, Math.PI * 2); context.fillStyle = `rgba(157,107,255,${.16 + level * .3})`; context.fill();
  } else {
    const barWidth = width / count;
    for (let i = 0; i < count; i += 1) {
      const bin = data ? data[Math.floor(i / count * data.length)] / 255 : (Math.sin(time * .003 + i * .24) + 1) * .12;
      const envelope = style === 'spectrum' ? Math.pow(1 - i / count, .35) : 1;
      const barHeight = Math.max(height * .012, (bin * .77 + level * .18) * height * envelope);
      const x = i * barWidth + barWidth * .16;
      const gradient = context.createLinearGradient(0, baseY - barHeight, 0, baseY);
      gradient.addColorStop(0, '#ff4d9d'); gradient.addColorStop(.5, '#a66bff'); gradient.addColorStop(1, '#4de2de');
      context.fillStyle = gradient; context.shadowBlur = 10; context.shadowColor = '#a66bff';
      context.fillRect(x, baseY - barHeight, Math.max(1, barWidth * .68), barHeight);
    }
  }
  context.restore();
}

function getActiveTrack() {
  return state.tracks.find((track) => track.id === state.selectedId && track.visible) || state.tracks.find((track) => track.visible) || null;
}

function drawTrack(context, track, time, x = 0, y = 0, width = outputCanvas.width, height = outputCanvas.height) {
  const video = track.video;
  if (!track.visible || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth) return;
  const rect = fitRect(video, x, y, width, height);
  context.save();
  context.globalAlpha = track.opacity;
  const zoom = 1 + (track.fisheye ? state.fisheyeStrength * .46 : 0);
  const cx = x + width / 2; const cy = y + height / 2;
  context.translate(cx, cy); context.scale(zoom, zoom); context.translate(-cx, -cy);
  context.filter = track.fisheye ? `saturate(${1.35 + state.fisheyeStrength}) contrast(1.12)` : 'none';
  context.drawImage(video, rect.x, rect.y, rect.width, rect.height);
  context.restore();
  if (track.fisheye && state.fisheyeStrength > 0) {
    context.save(); context.globalAlpha = track.opacity;
    const vignette = context.createRadialGradient(cx, cy, height * .08, cx, cy, Math.max(width, height) * .62);
    vignette.addColorStop(.34, 'rgba(0,0,0,0)'); vignette.addColorStop(1, `rgba(0,0,0,${state.fisheyeStrength * .5})`);
    context.fillStyle = vignette; context.fillRect(x, y, width, height); context.restore();
  }
}

function drawStrobe(context, time) {
  if (state.strobeIntensity <= .001) return;
  const period = 1000 / state.strobeRate;
  const freePulse = (time % period) < Math.min(90, period * .28);
  const beatPulse = state.micEnabled && (time - state.lastBeat < Math.max(50, Math.min(130, period * .55)));
  if (!freePulse && !beatPulse) return;
  const audioStrength = state.micEnabled ? clamp(state.micPeak * 2, 0, 1) : .4;
  const alpha = clamp(state.strobeIntensity * (.12 + audioStrength * .5), 0, .62);
  context.save(); context.globalCompositeOperation = 'screen'; context.fillStyle = `rgba(240,248,255,${alpha})`; context.fillRect(0, 0, context.canvas.width, context.canvas.height); context.restore();
}

function renderScene(context, canvas, time, preview = false) {
  drawBackdrop(context, canvas);
  if (preview) {
    const track = getActiveTrack();
    if (track) drawTrack(context, track, time, 0, 0, canvas.width, canvas.height);
    else {
      context.fillStyle = '#9aa8bd'; context.font = '600 30px system-ui'; context.textAlign = 'center'; context.fillText('Preview — Clip auswählen', canvas.width / 2, canvas.height / 2);
    }
    return;
  }
  // Array order is back-to-front: newly imported layers appear on top.
  state.tracks.forEach((track) => drawTrack(context, track, time));
  if (state.visualizerStyle !== 'off') renderVisualizer(context, canvas.width, canvas.height, time);
  drawStrobe(context, time);
  if (!state.tracks.some((track) => track.visible)) {
    context.fillStyle = '#9aa8bd'; context.font = '600 30px system-ui'; context.textAlign = 'center'; context.fillText('Importiere Videos für die Ausgabe', canvas.width / 2, canvas.height / 2);
  }
}

function renderTrackList() {
  tracksContainer.replaceChildren();
  if (!state.tracks.length) {
    const empty = document.createElement('div'); empty.className = 'empty-state'; empty.textContent = 'Noch keine Clips. Importiere Videos, um loszulegen.'; tracksContainer.appendChild(empty); return;
  }
  state.tracks.forEach((track, index) => {
    const row = document.createElement('article'); row.className = `track${track.id === state.selectedId ? ' selected' : ''}`;
    const titleWrap = document.createElement('div'); titleWrap.className = 'track-title-wrap';
    const number = document.createElement('span'); number.className = 'track-number'; number.textContent = String(index + 1).padStart(2, '0');
    const titleStack = document.createElement('div'); titleStack.style.minWidth = '0';
    const title = document.createElement('div'); title.className = 'track-title'; title.textContent = track.name; title.title = track.name;
    const subtitle = document.createElement('div'); subtitle.className = 'track-subtitle'; subtitle.textContent = track.visible ? (track.id === state.selectedId ? 'Preview ausgewählt' : 'Video-Ebene') : 'Ausgeblendet';
    titleStack.append(title, subtitle); titleWrap.append(number, titleStack);
    const toggles = document.createElement('div'); toggles.className = 'track-toggles';
    toggles.append(makeCheck('Sichtbar', 'track-visible', track.id, track.visible), makeCheck('Strobe', 'track-strobe', track.id, track.strobe), makeCheck('Fisheye', 'track-fisheye', track.id, track.fisheye));
    const opacity = makeRangeControl('Deckkraft', 'track-opacity', track.id, track.opacity, '0.01');
    const volume = makeRangeControl('Lautstärke', 'track-volume', track.id, track.volume, '0.01');
    const order = document.createElement('div'); order.className = 'track-order';
    order.append(makeOrderButton('↑', 'up', track.id, 'Ebene nach vorne'), makeOrderButton('↓', 'down', track.id, 'Ebene nach hinten'));
    const actions = document.createElement('div'); actions.className = 'track-actions';
    const select = document.createElement('button'); select.type = 'button'; select.className = 'track-select'; select.dataset.action = 'select'; select.dataset.id = track.id; select.textContent = track.id === state.selectedId ? 'Preview ✓' : 'Preview';
    const remove = document.createElement('button'); remove.type = 'button'; remove.dataset.action = 'remove'; remove.dataset.id = track.id; remove.textContent = 'Löschen';
    actions.append(select, remove); row.append(titleWrap, toggles, opacity, volume, order, actions); tracksContainer.appendChild(row);
  });
}

function makeCheck(label, className, id, checked) {
  const wrapper = document.createElement('label'); const input = document.createElement('input'); input.type = 'checkbox'; input.className = className; input.dataset.id = id; input.checked = checked;
  wrapper.append(input, document.createTextNode(label)); return wrapper;
}
function makeRangeControl(labelText, className, id, value, step) {
  const wrapper = document.createElement('label'); wrapper.className = 'track-range'; wrapper.append(document.createTextNode(`${labelText} ${Math.round(value * 100)}%`));
  const input = document.createElement('input'); input.type = 'range'; input.min = '0'; input.max = '1'; input.step = step; input.value = value; input.className = className; input.dataset.id = id; input.setAttribute('aria-label', labelText); wrapper.appendChild(input); return wrapper;
}
function makeOrderButton(text, direction, id, label) {
  const button = document.createElement('button'); button.type = 'button'; button.dataset.action = direction; button.dataset.id = id; button.textContent = text; button.title = label; return button;
}

tracksContainer.addEventListener('input', (event) => {
  const control = event.target; const track = state.tracks.find((item) => item.id === control.dataset.id); if (!track) return;
  if (control.classList.contains('track-visible')) track.visible = control.checked;
  if (control.classList.contains('track-strobe')) track.strobe = control.checked;
  if (control.classList.contains('track-fisheye')) track.fisheye = control.checked;
  if (control.classList.contains('track-opacity')) track.opacity = Number(control.value);
  if (control.classList.contains('track-volume')) { track.volume = Number(control.value); track.video.volume = track.volume; track.video.muted = track.volume === 0; }
  if (control.type === 'checkbox') renderTrackList();
});
tracksContainer.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]'); if (!button) return;
  const index = state.tracks.findIndex((track) => track.id === button.dataset.id); if (index < 0) return;
  const action = button.dataset.action;
  if (action === 'remove') { const [track] = state.tracks.splice(index, 1); track.video.pause(); URL.revokeObjectURL(track.url); if (state.selectedId === track.id) state.selectedId = state.tracks[0]?.id || null; }
  if (action === 'select') state.selectedId = state.tracks[index].id;
  if (action === 'up' && index < state.tracks.length - 1) [state.tracks[index], state.tracks[index + 1]] = [state.tracks[index + 1], state.tracks[index]];
  if (action === 'down' && index > 0) [state.tracks[index], state.tracks[index - 1]] = [state.tracks[index - 1], state.tracks[index]];
  renderTrackList();
});

videoInput.addEventListener('change', (event) => {
  const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith('video/'));
  files.forEach((file) => {
    const url = URL.createObjectURL(file); const video = document.createElement('video');
    video.src = url; video.loop = true; video.muted = true; video.playsInline = true; video.preload = 'auto'; video.setAttribute('playsinline', '');
    const track = { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, name: file.name.replace(/\.[^/.]+$/, ''), url, video, opacity: .8, volume: .8, visible: true, strobe: false, fisheye: false };
    video.addEventListener('canplay', () => video.play().catch((error) => console.warn('Video playback could not start:', error)), { once: true });
    video.addEventListener('error', () => { console.error(`Video konnte nicht geladen werden: ${file.name}`, video.error); track.name += ' (Ladefehler)'; renderTrackList(); });
    state.tracks.push(track); state.selectedId = track.id;
  });
  renderTrackList(); event.target.value = '';
});

function updateControls() {
  state.strobeIntensity = Number(strobeIntensityInput.value); state.strobeRate = Number(strobeRateInput.value);
  state.fisheyeStrength = Number(fisheyeStrengthInput.value); state.visualizerGain = Number(visualizerGainInput.value);
  state.visualizerStyle = visualizerStyleInput.value;
  document.getElementById('strobeValue').value = `${Math.round(state.strobeIntensity * 100)}%`;
  document.getElementById('rateValue').value = `${state.strobeRate} Hz`;
  document.getElementById('fisheyeValue').value = `${Math.round(state.fisheyeStrength * 100)}%`;
  document.getElementById('gainValue').value = `${state.visualizerGain}×`;
}
[strobeIntensityInput, strobeRateInput, fisheyeStrengthInput, visualizerGainInput, visualizerStyleInput].forEach((input) => input.addEventListener('input', updateControls));
visualizerStyleInput.addEventListener('change', updateControls);

async function toggleMicrophone() {
  if (state.micEnabled) {
    state.micStream?.getTracks().forEach((track) => track.stop()); await state.audioContext?.close();
    state.audioContext = null; state.analyser = null; state.micStream = null; state.timeData = null; state.frequencyData = null; state.micEnabled = false; state.micLevel = 0; state.micPeak = 0;
    micToggleButton.innerHTML = '<span class="mic-icon">◉</span> Mikrofon aktivieren'; micStatus.textContent = 'AUS'; micStatus.style.color = '#ff718e'; micHelp.textContent = 'Mikrofon erlauben, um Visualizer und Strobe live zu steuern.'; return;
  }
  if (!navigator.mediaDevices?.getUserMedia) { micHelp.textContent = 'Mikrofon braucht HTTPS oder localhost und einen unterstützten Browser.'; return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioContextClass(); await audioContext.resume();
    const analyser = audioContext.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = .68; analyser.minDecibels = -90; analyser.maxDecibels = -10;
    audioContext.createMediaStreamSource(stream).connect(analyser);
    state.audioContext = audioContext; state.analyser = analyser; state.micStream = stream;
    state.timeData = new Uint8Array(analyser.fftSize); state.frequencyData = new Uint8Array(analyser.frequencyBinCount); state.micEnabled = true;
    micToggleButton.innerHTML = '<span class="mic-icon">◉</span> Mikrofon deaktivieren'; micStatus.textContent = 'LIVE'; micStatus.style.color = '#4de2de'; micHelp.textContent = 'Mikrofon aktiv — sprich oder spiele Musik ab, um den Pegel zu testen.';
  } catch (error) {
    console.error('Mikrofonzugriff fehlgeschlagen:', error);
    micHelp.textContent = error.name === 'NotAllowedError' ? 'Zugriff verweigert. Erlaube das Mikrofon über das Schloss-Symbol im Browser.' : 'Mikrofon nicht verfügbar. Prüfe Verbindung, Gerät und Browser-Berechtigung.';
  }
}
micToggleButton.addEventListener('click', toggleMicrophone);

function updateAudio() {
  if (!state.analyser || !state.timeData || !state.frequencyData) { state.micLevel *= .88; state.micPeak *= .88; micMeterFill.style.width = `${Math.round(state.micLevel * 100)}%`; return; }
  state.analyser.getByteTimeDomainData(state.timeData); state.analyser.getByteFrequencyData(state.frequencyData);
  let sum = 0; for (let i = 0; i < state.timeData.length; i += 1) { const sample = (state.timeData[i] - 128) / 128; sum += sample * sample; }
  const rms = Math.sqrt(sum / state.timeData.length);
  const raw = clamp(rms * state.visualizerGain * 4.5, 0, 1);
  state.micLevel = raw > state.micLevel ? state.micLevel * .35 + raw * .65 : state.micLevel * .82 + raw * .18;
  state.micPeak = Math.max(raw, state.micPeak * .92);
  const now = performance.now();
  if (raw > .12 && state.previousLevel <= .12 && now - state.lastBeat > 140) state.lastBeat = now;
  state.previousLevel = raw;
  micMeterFill.style.width = `${Math.round(state.micLevel * 100)}%`;
}

async function detectMonitors() {
  if (typeof window.getScreenDetails !== 'function') {
    monitorHelp.textContent = 'Mehrere Bildschirme werden von diesem Browser nicht erkannt. Das Ausgabe-Fenster lässt sich auf den gewünschten Bildschirm ziehen.'; return;
  }
  try {
    const details = await window.getScreenDetails(); state.screens = details.screens;
    monitorSelect.replaceChildren();
    state.screens.forEach((screen, index) => {
      const option = document.createElement('option'); option.value = String(index); option.textContent = `${screen.label || `Bildschirm ${index + 1}`}${screen.isPrimary ? ' (Primär)' : ''}`; monitorSelect.appendChild(option);
    });
    monitorHelp.textContent = 'Bildschirm auswählen und „Ausgabe-Fenster öffnen“ klicken.';
  } catch (error) {
    console.warn('Bildschirmerkennung nicht erlaubt:', error);
    monitorHelp.textContent = 'Bildschirm-Erkennung nicht erlaubt oder nicht unterstützt. Ausgabe-Fenster einfach auf den Monitor ziehen.';
  }
}
document.getElementById('detectMonitors').addEventListener('click', detectMonitors);
monitorSelect.addEventListener('change', () => { state.selectedScreen = state.screens[Number(monitorSelect.value)] || null; });

function openOutputWindow() {
  const popup = window.open('', 'vj-studio-output', 'popup,width=1280,height=760');
  if (!popup) { monitorHelp.textContent = 'Popup blockiert. Erlaube Popups für diese Seite und versuche es erneut.'; return; }
  state.outputWindow = popup;
  popup.document.open(); popup.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VJ Studio — Live Ausgabe</title><style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#05070c;color:#aab4c3;font:12px system-ui}.bar{height:34px;padding:0 12px;display:flex;align-items:center;justify-content:space-between;background:#101620;border-bottom:1px solid #253040;letter-spacing:.12em;font-size:9px;font-weight:800}.live{color:#ff718e}.live i{display:inline-block;width:7px;height:7px;margin-right:6px;border-radius:50%;background:#ff4e70}canvas{display:block;width:100%;height:calc(100% - 34px);object-fit:contain}</style></head><body><div class="bar"><span>VJ STUDIO · PROGRAM OUTPUT</span><span class="live"><i></i>LIVE</span></div><canvas id="externalCanvas" width="1280" height="720"></canvas></body></html>`); popup.document.close();
  const screen = state.selectedScreen || state.screens[Number(monitorSelect.value)] || null;
  if (screen) { try { popup.moveTo(screen.availLeft, screen.availTop); popup.resizeTo(screen.availWidth, screen.availHeight); } catch (error) { console.info('Fenster konnte nicht automatisch verschoben werden:', error); } }
  monitorHelp.textContent = 'Live-Ausgabe geöffnet. Bei Bedarf Vollbild im Ausgabe-Fenster aktivieren.';
}
document.getElementById('openOutput').addEventListener('click', openOutputWindow);
document.getElementById('fullscreenOutput').addEventListener('click', () => {
  const target = state.outputWindow && !state.outputWindow.closed ? state.outputWindow : window;
  target.document.documentElement.requestFullscreen?.().catch(() => {});
});

function animate(time) {
  updateAudio(); renderScene(previewCtx, previewCanvas, time, true); renderScene(outputCtx, outputCanvas, time, false);
  if (state.outputWindow && !state.outputWindow.closed) {
    const externalCanvas = state.outputWindow.document.getElementById('externalCanvas');
    if (externalCanvas) { const externalCtx = externalCanvas.getContext('2d'); externalCtx.drawImage(outputCanvas, 0, 0, externalCanvas.width, externalCanvas.height); }
  } else if (state.outputWindow?.closed) state.outputWindow = null;
  const active = getActiveTrack(); previewLabel.textContent = active ? active.name : 'Kein Clip ausgewählt';
  outputLabel.textContent = `${state.tracks.filter((track) => track.visible).length} Ebenen aktiv`;
  requestAnimationFrame(animate);
}
updateControls(); renderTrackList(); requestAnimationFrame(animate);
