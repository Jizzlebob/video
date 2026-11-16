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
  visualizerBars: [],
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function renderTrackList() {
  tracksContainer.replaceChildren();
  state.tracks.forEach((track) => {
    const row = document.createElement('div');
    row.className = 'track';

    const title = document.createElement('p');
    title.className = 'track-title';
    title.textContent = track.name;

    const controls = document.createElement('div');
    controls.className = 'track-controls';
    controls.innerHTML = `
      <div class="track-toggle-row">
        <label><input type="checkbox" class="track-strobe" data-id="${track.id}" ${track.strobe ? 'checked' : ''}> Strobe</label>
        <label><input type="checkbox" class="track-fisheye" data-id="${track.id}" ${track.fisheye ? 'checked' : ''}> Fisheye</label>
      </div>
      <input type="range" min="0" max="1" step="0.01" value="${track.volume}" class="track-volume" data-id="${track.id}" aria-label="Lautstärke">
      <div class="track-actions">
        <span>${Math.round(track.volume * 100)}%</span>
        <button class="remove-track" type="button" data-id="${track.id}">Entfernen</button>
      </div>
    `;

    row.append(title, controls);
    tracksContainer.appendChild(row);
  });
}

tracksContainer.addEventListener('input', (event) => {
  const target = event.target;
  const track = state.tracks.find((item) => item.id === target.dataset.id);
  if (!track) return;

  if (target.classList.contains('track-strobe')) track.strobe = target.checked;
  if (target.classList.contains('track-fisheye')) track.fisheye = target.checked;
  if (target.classList.contains('track-volume')) {
    track.volume = Number(target.value);
    track.video.volume = track.volume;
    // Changing the volume is a user gesture, so audio can be unmuted here.
    track.video.muted = track.volume === 0;
    const label = target.closest('.track')?.querySelector('.track-actions span');
    if (label) label.textContent = `${Math.round(track.volume * 100)}%`;
  }
});

tracksContainer.addEventListener('click', (event) => {
  const button = event.target.closest('.remove-track');
  if (!button) return;
  const index = state.tracks.findIndex((track) => track.id === button.dataset.id);
  if (index < 0) return;
  const [track] = state.tracks.splice(index, 1);
  track.video.pause();
  URL.revokeObjectURL(track.url);
  renderTrackList();
});

videoInput.addEventListener('change', (event) => {
  const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith('video/'));

  for (const file of files) {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.src = url;
    video.loop = true;
    // Muted autoplay is allowed by browsers, so the video appears immediately.
    // Use the track volume slider to enable its audio.
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.setAttribute('playsinline', '');

    const track = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: file.name.replace(/\.[^/.]+$/, ''),
      url,
      volume: 0.8,
      strobe: true,
      fisheye: false,
      video,
      started: false,
    };

    video.addEventListener('canplay', () => {
      if (!track.started) {
        track.started = true;
        video.play().catch((error) => {
          console.warn('Video playback could not start:', error);
        });
      }
    });
    video.addEventListener('error', () => {
      console.error(`Video konnte nicht geladen werden: ${file.name}`, video.error);
      track.name = `${track.name} (konnte nicht geladen werden)`;
      renderTrackList();
    });

    state.tracks.push(track);
  }

  renderTrackList();
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

function createVisualizerBars() {
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < 32; i += 1) {
    const bar = document.createElement('span');
    bar.className = 'visualizer-bar';
    bar.style.height = '4%';
    fragment.appendChild(bar);
    state.visualizerBars.push(bar);
  }
  visualizer.appendChild(fragment);
}

function renderVisualizer() {
  const data = state.frequencyData;
  state.visualizerBars.forEach((bar, index) => {
    let level = 0;
    if (data) {
      const bin = Math.min(data.length - 1, Math.floor((index / state.visualizerBars.length) * data.length));
      level = data[bin] / 255;
    }
    const motion = data ? 0 : (Math.sin(performance.now() * 0.003 + index * 0.7) + 1) * 0.035;
    const height = clamp((level * state.visualizerGain + motion) * 100, 4, 100);
    bar.style.height = `${height}%`;
  });
}

async function toggleMicrophone() {
  if (!navigator.mediaDevices?.getUserMedia) {
    alert('Mikrofonzugriff wird in diesem Browser nicht unterstützt.');
    return;
  }

  if (state.micEnabled) {
    state.micStream?.getTracks().forEach((track) => track.stop());
    await state.audioContext?.close();
    state.audioContext = null;
    state.analyser = null;
    state.micStream = null;
    state.frequencyData = null;
    state.micEnabled = false;
    micToggleButton.textContent = 'Mikrofon aktivieren';
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioContextClass();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.75;
    audioContext.createMediaStreamSource(stream).connect(analyser);

    state.audioContext = audioContext;
    state.analyser = analyser;
    state.micStream = stream;
    state.frequencyData = new Uint8Array(analyser.frequencyBinCount);
    state.micEnabled = true;
    micToggleButton.textContent = 'Mikrofon deaktivieren';
  } catch (error) {
    console.error('Mikrofonzugriff fehlgeschlagen:', error);
    alert('Mikrofonzugriff verweigert. Bitte erlaube den Zugriff in deinem Browser.');
  }
}

micToggleButton.addEventListener('click', toggleMicrophone);

function updateAudioMeter() {
  if (!state.analyser || !state.frequencyData) {
    state.micLevel = 0;
    renderVisualizer();
    return;
  }

  state.analyser.getByteFrequencyData(state.frequencyData);
  let sum = 0;
  for (let i = 0; i < state.frequencyData.length; i += 1) sum += state.frequencyData[i];
  state.micLevel = clamp((sum / state.frequencyData.length / 255) * state.visualizerGain, 0, 1);
  renderVisualizer();
}

function drawTrack(track, x, y, width, height, time) {
  const video = track.video;
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

  const mic = state.micLevel;
  const strobeEnabled = track.strobe && state.strobeIntensity > 0.02;
  // Louder microphone input increases flash rate and intensity.
  const rate = 0.006 + mic * 0.035;
  const flash = strobeEnabled && Math.sin(time * rate) > 1 - state.strobeIntensity * (0.25 + mic * 0.7);
  const alpha = flash ? 0.22 : 1;
  const zoom = 1 + (track.fisheye ? state.fisheyeStrength * 0.42 : 0);
  const centerX = x + width / 2;
  const centerY = y + height / 2;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(centerX, centerY);
  ctx.scale(zoom, zoom);
  ctx.translate(-centerX, -centerY);
  ctx.filter = track.fisheye ? `saturate(${1.3 + state.fisheyeStrength}) contrast(1.12)` : 'none';
  ctx.drawImage(video, x, y, width, height);
  ctx.restore();

  if (track.fisheye && state.fisheyeStrength > 0) {
    const vignette = ctx.createRadialGradient(centerX, centerY, height * 0.1, centerX, centerY, width * 0.72);
    vignette.addColorStop(0.55, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, `rgba(0,0,0,${state.fisheyeStrength * 0.62})`);
    ctx.fillStyle = vignette;
    ctx.fillRect(x, y, width, height);
  }
}

function animate(time) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#0f172a');
  gradient.addColorStop(1, '#111827');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  updateAudioMeter();

  if (state.tracks.length === 0) {
    ctx.fillStyle = 'rgba(226, 232, 240, 0.8)';
    ctx.font = '700 40px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Videos importieren', canvas.width / 2, canvas.height / 2);
  } else {
    const columns = Math.min(2, Math.ceil(Math.sqrt(state.tracks.length)));
    const rows = Math.ceil(state.tracks.length / columns);
    const cellWidth = canvas.width / columns;
    const cellHeight = canvas.height / rows;
    state.tracks.forEach((track, index) => {
      drawTrack(track, (index % columns) * cellWidth, Math.floor(index / columns) * cellHeight, cellWidth, cellHeight, time);
    });
  }
  requestAnimationFrame(animate);
}

createVisualizerBars();
requestAnimationFrame(animate);
