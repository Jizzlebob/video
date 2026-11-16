const canvas = document.getElementById('mixCanvas');
const ctx = canvas.getContext('2d');
const tracksContainer = document.getElementById('tracks');
const videoInput = document.getElementById('videoInput');
const strobeIntensityInput = document.getElementById('strobeIntensity');
const fisheyeStrengthInput = document.getElementById('fisheyeStrength');
const visualizerGainInput = document.getElementById('visualizerGain');
const micToggleButton = document.getElementById('micToggle');
const visualizer = document.getElementById('visualizer');

const state = {
  tracks: [],
  strobeIntensity: Number(strobeIntensityInput.value),
  fisheyeStrength: Number(fisheyeStrengthInput.value),
  visualizerGain: Number(visualizerGainInput.value),
  micLevel: 0,
  micEnabled: false,
  audioContext: null,
  analyser: null,
  micStream: null,
  frequencyData: null,
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function updateTrackVolume(id, volume) {
  const track = state.tracks.find((entry) => entry.id === id);
  if (!track) return;
  track.volume = volume;
  track.video.volume = volume;
}

function renderTrackList() {
  tracksContainer.innerHTML = '';

  state.tracks.forEach((track) => {
    const row = document.createElement('div');
    row.className = 'track';

    row.innerHTML = `
      <p class="track-title">${track.name}</p>
      <div class="track-controls">
        <div class="track-toggle-row">
          <label>
            <input type="checkbox" class="track-strobe" data-id="${track.id}" checked />
            Strobe
          </label>
          <label>
            <input type="checkbox" class="track-fisheye" data-id="${track.id}" />
            Fisheye
          </label>
        </div>
        <input type="range" min="0" max="1" step="0.01" value="${track.volume}" class="track-volume" data-id="${track.id}" />
        <div class="track-actions">
          <span>${Math.round(track.volume * 100)}%</span>
          <button class="remove-track" type="button" data-id="${track.id}">Entfernen</button>
        </div>
      </div>
    `;

    tracksContainer.appendChild(row);
  });
}

function handleTrackInteraction(event) {
  const target = event.target;
  const id = target.dataset.id;

  if (!id) return;

  if (target.classList.contains('track-strobe')) {
    const track = state.tracks.find((entry) => entry.id === id);
    if (track) track.strobe = target.checked;
  }

  if (target.classList.contains('track-fisheye')) {
    const track = state.tracks.find((entry) => entry.id === id);
    if (track) track.fisheye = target.checked;
  }

  if (target.classList.contains('track-volume')) {
    updateTrackVolume(id, Number(target.value));
    const row = target.closest('.track');
    const label = row?.querySelector('.track-actions span');
    if (label) {
      label.textContent = `${Math.round(Number(target.value) * 100)}%`;
    }
  }

  if (target.classList.contains('remove-track')) {
    state.tracks = state.tracks.filter((track) => track.id !== id);
    renderTrackList();
  }
}

tracksContainer.addEventListener('input', handleTrackInteraction);
tracksContainer.addEventListener('click', handleTrackInteraction);

videoInput.addEventListener('change', (event) => {
  const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith('video/'));

  files.forEach((file) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.src = url;
    video.loop = true;
    video.muted = false;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    video.volume = 0.8;
    video.autoplay = true;
    video.setAttribute('playsinline', 'true');

    video.addEventListener('loadeddata', () => {
      video.play().catch(() => {});
    });

    const track = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: file.name.replace(/\.[^/.]+$/, ''),
      volume: 0.8,
      strobe: true,
      fisheye: false,
      video,
    };

    state.tracks.push(track);
    renderTrackList();
  });

  event.target.value = '';
});

strobeIntensityInput.addEventListener('input', (event) => {
  state.strobeIntensity = Number(event.target.value);
});

fisheyeStrengthInput.addEventListener('input', (event) => {
  state.fisheyeStrength = Number(event.target.value);
});

visualizerGainInput.addEventListener('input', (event) => {
  state.visualizerGain = Number(event.target.value);
});

function renderVisualizer(level) {
  const bars = Array.from({ length: 32 }, (_, index) => {
    const band = (index / 32) * 1.5;
    const base = Math.sin(index * 0.75 + performance.now() * 0.01) * 0.5 + 0.5;
    const value = clamp((base + level * 0.8 + band) * 100, 10, 100);
    return `<span class="visualizer-bar" style="height:${value}%"></span>`;
  }).join('');

  visualizer.innerHTML = bars;
}

async function toggleMicrophone() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert('Dein Browser unterstützt Mikrofon-Input nicht.');
    return;
  }

  if (state.micEnabled) {
    if (state.micStream) {
      state.micStream.getTracks().forEach((track) => track.stop());
    }
    if (state.audioContext) {
      await state.audioContext.close();
    }

    state.audioContext = null;
    state.analyser = null;
    state.micStream = null;
    state.frequencyData = null;
    state.micEnabled = false;
    micToggleButton.textContent = 'Mikrofon aktivieren';
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.9;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    state.audioContext = audioContext;
    state.analyser = analyser;
    state.micStream = stream;
    state.frequencyData = new Uint8Array(analyser.frequencyBinCount);
    state.micEnabled = true;
    micToggleButton.textContent = 'Mikrofon deaktivieren';
  } catch (error) {
    console.error('Microphone access failed:', error);
    alert('Mikrofonzugriff wurde verweigert. Bitte erlaube die Nutzung im Browser.');
  }
}

micToggleButton.addEventListener('click', toggleMicrophone);

function updateAudioMeter() {
  if (!state.analyser || !state.frequencyData) {
    state.micLevel = 0;
    renderVisualizer(0);
    return;
  }

  state.analyser.getByteFrequencyData(state.frequencyData);

  let sum = 0;
  for (let i = 0; i < state.frequencyData.length; i += 1) {
    sum += state.frequencyData[i];
  }

  const avg = sum / state.frequencyData.length / 255;
  state.micLevel = clamp(avg * state.visualizerGain, 0, 1.2);
  renderVisualizer(state.micLevel);
}

function drawTrack(video, x, y, w, h, track, time) {
  if (!video || video.readyState < 2) return;

  const hasStrobe = track.strobe && state.strobeIntensity > 0.02;
  const strobeDrift = hasStrobe ? (Math.sin(time * 0.012 + x * 0.3) > 0 ? 0.25 : 1) : 1;
  const micBoost = state.micLevel * (hasStrobe ? 1.8 : 0.4);
  const alpha = clamp((hasStrobe ? strobeDrift : 1) * (0.85 + micBoost), 0.2, 1.2);

  ctx.save();
  ctx.globalAlpha = alpha;

  const zoom = 1 + state.fisheyeStrength * (track.fisheye ? 0.55 : 0.1);
  const cx = x + w / 2;
  const cy = y + h / 2;

  ctx.translate(cx, cy);
  ctx.scale(zoom, zoom);
  ctx.translate(-cx, -cy);

  if (track.fisheye) {
    ctx.beginPath();
    ctx.moveTo(x + w * 0.15, y);
    ctx.lineTo(x + w * 0.85, y);
    ctx.lineTo(x + w, y + h * 0.2);
    ctx.lineTo(x + w, y + h * 0.8);
    ctx.lineTo(x + w * 0.85, y + h);
    ctx.lineTo(x + w * 0.15, y + h);
    ctx.lineTo(x, y + h * 0.8);
    ctx.lineTo(x, y + h * 0.2);
    ctx.closePath();
    ctx.clip();
  }

  ctx.filter = `brightness(${1 + micBoost * 0.8}) contrast(${1.1 + micBoost}) saturate(${1.4 + micBoost})`;
  ctx.drawImage(video, x, y, w, h);
  ctx.restore();

  if (track.fisheye) {
    ctx.save();
    ctx.strokeStyle = `rgba(34, 211, 238, ${0.28 + micBoost * 0.4})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.15, y);
    ctx.lineTo(x + w * 0.85, y);
    ctx.lineTo(x + w, y + h * 0.2);
    ctx.lineTo(x + w, y + h * 0.8);
    ctx.lineTo(x + w * 0.85, y + h);
    ctx.lineTo(x + w * 0.15, y + h);
    ctx.lineTo(x, y + h * 0.8);
    ctx.lineTo(x, y + h * 0.2);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}

function drawBackground(time) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#0f172a');
  gradient.addColorStop(0.5, '#111827');
  gradient.addColorStop(1, '#0b1120');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const glow = Math.sin(time * 0.0018) * 0.5 + 0.5;
  ctx.fillStyle = `rgba(124, 58, 237, ${0.18 + glow * 0.14})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function layoutTracks() {
  const trackCount = state.tracks.length || 1;
  const columns = Math.min(2, Math.ceil(Math.sqrt(trackCount)));
  const rows = Math.ceil(trackCount / columns);
  const cellWidth = canvas.width / columns;
  const cellHeight = canvas.height / rows;

  return { columns, rows, cellWidth, cellHeight };
}

function animateLoop(time) {
  drawBackground(time);
  updateAudioMeter();

  const { columns, cellWidth, cellHeight } = layoutTracks();

  state.tracks.forEach((track, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = col * cellWidth;
    const y = row * cellHeight;
    drawTrack(track.video, x, y, cellWidth, cellHeight, track, time);
  });

  if (!state.tracks.length) {
    ctx.fillStyle = 'rgba(226, 232, 240, 0.8)';
    ctx.font = '700 40px Segoe UI';
    ctx.textAlign = 'center';
    ctx.fillText('Videos importieren', canvas.width / 2, canvas.height / 2);
  }

  requestAnimationFrame(animateLoop);
}

requestAnimationFrame(animateLoop);
