// All sound is synthesised with WebAudio — no audio files, no network. An engine hum
// follows the car's speed, a two-tone siren follows the nearest police car, and a small
// step sequencer plays a bassline and hats for the city's music. Everything starts on the
// first user gesture (browsers block audio before one) and can be muted with L.

export function createAudio() {
  let context = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineFilter = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let sirenHigh = false;
  let musicGain = null;
  let musicTimer = null;
  let musicStep = 0;
  let muted = false;
  let started = false;

  // A minor-key bassline that walks the harbour at 96 BPM, 16 steps a bar.
  const BASS = [55, 0, 55, 0, 65.41, 0, 55, 0, 49, 0, 49, 0, 58.27, 0, 65.41, 0];
  const HAT_STEPS = [0, 2, 4, 6, 8, 10, 12, 14];

  function noiseBuffer(seconds) {
    const buffer = context.createBuffer(1, Math.floor(context.sampleRate * seconds), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function start() {
    if (started) return;
    started = true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(context.destination);

      // Engine: two detuned saws through a low-pass, pitch and loudness follow speed.
      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineOsc2 = context.createOscillator();
      engineOsc2.type = 'square';
      engineOsc2.frequency.value = 27.5;
      engineFilter = context.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 400;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();

      // Siren: one sine that alternates between two tones.
      sirenOsc = context.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 700;
      sirenGain = context.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();

      // Music: its own quiet bus.
      musicGain = context.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
      musicTimer = window.setInterval(playMusicStep, (60 / 96 / 4) * 1000);
    } catch {
      context = null;
    }
  }

  function playMusicStep() {
    if (!context || muted) return;
    const step = musicStep % 16;
    const freq = BASS[step];
    if (freq > 0) {
      const osc = context.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const gain = context.createGain();
      const now = context.currentTime;
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);
      osc.connect(gain);
      gain.connect(musicGain);
      osc.start(now);
      osc.stop(now + 0.24);
    }
    if (HAT_STEPS.includes(step)) {
      const src = context.createBufferSource();
      src.buffer = noiseBuffer(0.03);
      const filter = context.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 6000;
      const gain = context.createGain();
      gain.gain.value = 0.12;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(musicGain);
      src.start();
    }
    musicStep += 1;
  }

  function blip(freqStart, freqEnd, seconds, type, volume) {
    if (!context || muted) return;
    const now = context.currentTime;
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    osc.frequency.exponentialRampToValueAtTime(freqEnd, now + seconds);
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + seconds);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + seconds + 0.02);
  }

  return {
    start,
    isMuted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    /** Call every frame: engine follows speed (0 when on foot), siren follows police. */
    update(dt, speed, policeDistance) {
      if (!context) return;
      const target = speed > 5 ? 0.05 + Math.min(0.09, speed / 520 * 0.09) : 0;
      engineGain.gain.setTargetAtTime(muted ? 0 : target, context.currentTime, 0.1);
      const pitch = 50 + speed * 0.16;
      engineOsc.frequency.setTargetAtTime(pitch, context.currentTime, 0.1);
      engineOsc2.frequency.setTargetAtTime(pitch / 2, context.currentTime, 0.1);
      engineFilter.frequency.setTargetAtTime(300 + speed * 1.4, context.currentTime, 0.1);
      sirenTimer += dt;
      if (policeDistance !== null && policeDistance < 900) {
        if (sirenTimer > 0.42) {
          sirenTimer = 0;
          sirenHigh = !sirenHigh;
          sirenOsc.frequency.value = sirenHigh ? 950 : 700;
        }
        const volume = Math.max(0, 0.10 - policeDistance / 900 * 0.10);
        sirenGain.gain.setTargetAtTime(muted ? 0 : volume, context.currentTime, 0.1);
      } else {
        sirenGain.gain.setTargetAtTime(0, context.currentTime, 0.1);
      }
    },
    gunshot() {
      if (!context || muted) return;
      const src = context.createBufferSource();
      src.buffer = noiseBuffer(0.14);
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(3000, context.currentTime);
      filter.frequency.exponentialRampToValueAtTime(300, context.currentTime + 0.12);
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.5, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.14);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start();
    },
    crash() {
      if (!context || muted) return;
      const src = context.createBufferSource();
      src.buffer = noiseBuffer(0.2);
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 500;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.4, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.2);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start();
    },
    pickup() {
      blip(660, 660, 0.09, 'sine', 0.3);
      window.setTimeout(() => blip(880, 880, 0.12, 'sine', 0.3), 90);
    },
    jingle() {
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        window.setTimeout(() => blip(freq, freq, 0.18, 'triangle', 0.3), i * 110);
      });
    },
    busted() {
      [392, 311, 233].forEach((freq, i) => {
        window.setTimeout(() => blip(freq, freq * 0.94, 0.3, 'sawtooth', 0.2), i * 180);
      });
    },
  };
}
