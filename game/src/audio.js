// All sound is synthesised with WebAudio — no audio files, no network. An engine
// hum follows the car's speed, a two-tone siren follows the nearest police car,
// and a small step sequencer plays the city's music. Two loops share the sequencer:
// "Dusk", a slow minor bassline for cruising, and "Night Run", a busier loop with a
// plucked lead for when the heat is on. The sequencer swaps between them every
// four bars, and three stars or more force the tense loop at once. Everything
// starts on the first user gesture (browsers block audio before one) and can be
// muted with L.

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
  let wantedLevel = 0;
  let muted = false;
  let started = false;

  // "Dusk": a minor-key bassline that walks the harbour at 96 BPM, 16 steps a bar.
  const BASS_A = [55, 0, 55, 0, 65.41, 0, 55, 0, 49, 0, 49, 0, 58.27, 0, 65.41, 0];
  const HAT_A = [0, 2, 4, 6, 8, 10, 12, 14];
  // "Night Run": a driving bass with a plucked lead on top, same tempo, twice the nerves.
  const BASS_B = [55, 55, 0, 55, 0, 65.41, 0, 55, 82.41, 0, 82.41, 0, 73.42, 0, 65.41, 0];
  const LEAD_B = [220, 0, 0, 261.63, 0, 0, 329.63, 0, 0, 0, 261.63, 0, 220, 0, 196, 0];
  const HAT_B = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

  /** Which loop plays now: the tense one under three stars, otherwise four bars each. */
  function currentLoop() {
    if (wantedLevel >= 3) return 'B';
    return Math.floor(musicStep / 64) % 2 === 0 ? 'A' : 'B';
  }

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

  function note(freq, type, volume, seconds) {
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = context.createGain();
    const now = context.currentTime;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + seconds);
    osc.connect(gain);
    gain.connect(musicGain);
    osc.start(now);
    osc.stop(now + seconds + 0.02);
  }

  function hat(volume) {
    const src = context.createBufferSource();
    src.buffer = noiseBuffer(0.03);
    const filter = context.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 6000;
    const gain = context.createGain();
    gain.gain.value = volume;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(musicGain);
    src.start();
  }

  function playMusicStep() {
    if (!context || muted) return;
    const loop = currentLoop();
    const step = musicStep % 16;
    const bass = loop === 'A' ? BASS_A : BASS_B;
    const freq = bass[step];
    if (freq > 0) note(freq, 'triangle', 0.5, 0.22);
    if (loop === 'B') {
      const lead = LEAD_B[step];
      if (lead > 0) note(lead, 'square', 0.12, 0.14);
      if (HAT_B.includes(step)) hat(0.06);
    } else if (HAT_A.includes(step)) {
      hat(0.12);
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
    /** Which music loop is playing now: 'A' for the dusk cruise, 'B' for the night run. */
    loop() {
      return currentLoop();
    },
    /** Call every frame: engine follows speed (0 when on foot), siren follows police. */
    update(dt, speed, policeDistance, wanted) {
      wantedLevel = wanted || 0;
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
