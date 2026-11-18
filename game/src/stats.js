// Stats & records: Mara's running record, opened with H. It watches the
// world while you play — money earned, jobs and fares done, cars stolen and
// rides taken, race bests, hidden packages and play time — and keeps all-time
// totals in localStorage, so the record survives across sessions. The panel
// is an overlay: the city keeps moving while you read it.

/** localStorage key for the all-time totals. */
const TOTALS_KEY = 'neon-harbor-stats-totals';
/** localStorage key the race system keeps its best times under. */
const RACE_BEST_KEY = 'neon-harbor-race-best';
/** localStorage key the package system keeps its found flags under. */
const PACKAGE_KEY = 'neon-harbor-packages';
/** How many packages the city hides. */
const PACKAGE_TOTAL = 12;
/** How often the totals are written while playing, in seconds. */
const SAVE_EVERY = 5;

/** The three races, for the best-times rows. */
const RACE_ROWS = [
  { id: 'sprint', name: 'Harbor Sprint' },
  { id: 'loop', name: 'Uptown Loop' },
  { id: 'night', name: 'Night Run' },
];

function readJSON(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be off: the record then lasts this visit only.
  }
}

function money(n) {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

function tenths(seconds) {
  if (seconds === undefined || seconds === null) return '—';
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}.${Math.floor((seconds - whole) * 10)}`;
}

function duration(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function rideLabel(car) {
  if (!car) return '—';
  if (car.police) return 'police cruiser';
  const kind = car.kind || car.name || car.type;
  if (kind) return String(kind);
  return 'street car';
}

export function createStats(state) {
  let open = false;
  let runEarned = 0;
  let lastMoney = state.money || 0;
  let rides = 0;
  let lastRide = '—';
  let prevCar = null;
  let runSeconds = 0;
  let saveTimer = 0;
  let lastMissions = (state.stats && state.stats.missionsDone) || 0;
  let totals = { earned: 0, jobs: 0, rides: 0, seconds: 0, ...readJSON(TOTALS_KEY, {}) };

  function saveTotals() {
    writeJSON(TOTALS_KEY, totals);
  }

  return {
    reset() {
      runEarned = 0;
      rides = 0;
      lastRide = '—';
      prevCar = null;
      runSeconds = 0;
      saveTimer = 0;
      lastMoney = state.money || 0;
      lastMissions = (state.stats && state.stats.missionsDone) || 0;
      saveTotals();
    },
    toggle() {
      open = !open;
      saveTotals();
      return open;
    },
    isOpen() {
      return open;
    },
    update(dt) {
      runSeconds += dt;
      const earned = (state.money || 0) - lastMoney;
      if (earned > 0) {
        runEarned += earned;
        totals.earned += earned;
      }
      lastMoney = state.money || 0;
      const done = (state.stats && state.stats.missionsDone) || 0;
      if (done > lastMissions) totals.jobs += done - lastMissions;
      lastMissions = done;
      const car = state.player ? state.player.inCar : null;
      if (car && car !== prevCar) {
        rides += 1;
        totals.rides += 1;
        lastRide = rideLabel(car);
      }
      prevCar = car || null;
      saveTimer += dt;
      if (saveTimer >= SAVE_EVERY) {
        saveTimer = 0;
        saveTotals();
      }
      return 0;
    },
    draw(ctx, state, view) {
      if (!open) return;
      const s = view.scale || 1;
      const best = readJSON(RACE_BEST_KEY, {});
      const found = readJSON(PACKAGE_KEY, []);
      let packages = 0;
      if (Array.isArray(found)) for (const f of found) if (f) packages += 1;
      const st = state.stats || {};
      const rows = [
        ['Money on hand', money(state.money || 0)],
        ['Money earned (this session)', money(runEarned)],
        ['Jobs completed', String(st.missionsDone || 0)],
        ['Fares done', String(st.faresDone || 0)],
        ['Cars stolen', String(st.carsStolen || 0)],
        ['Rides taken', `${rides} (last: ${lastRide})`],
        ...RACE_ROWS.map((race) => [`${race.name} best`, tenths(best[race.id])]),
        ['Packages found', `${packages} of ${PACKAGE_TOTAL}`],
        ['Play time (this session)', duration(runSeconds)],
        ['All-time totals', `${money(totals.earned)} earned · ${totals.jobs} jobs · ${totals.rides} rides · ${duration(totals.seconds)}`],
      ];
      const pad = 22 * s;
      const rowH = 27 * s;
      const w = Math.min(660 * s, view.width * 0.66);
      const h = 58 * s + rows.length * rowH + 34 * s;
      const x = (view.width - w) / 2;
      const y = (view.height - h) / 2;
      ctx.save();
      ctx.fillStyle = 'rgba(8, 12, 20, 0.93)';
      ctx.fillRect(x, y, w, h);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffd25a';
      ctx.strokeRect(x, y, w, h);
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffd25a';
      ctx.font = `bold ${Math.round(22 * s)}px sans-serif`;
      ctx.fillText("MARA'S RECORD", x + pad, y + 36 * s);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.font = `${Math.round(13 * s)}px sans-serif`;
      ctx.fillText('Port Azure — press H to close', x + pad, y + 54 * s);
      ctx.font = `${Math.round(15 * s)}px sans-serif`;
      rows.forEach(([label, value], i) => {
        const ry = y + 58 * s + i * rowH;
        if (i % 2 === 0) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
          ctx.fillRect(x + 8, ry, w - 16, rowH);
        }
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.fillText(label, x + pad, ry + rowH * 0.68);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'right';
        ctx.fillText(value, x + w - pad, ry + rowH * 0.68);
        ctx.textAlign = 'left';
      });
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = `${Math.round(12 * s)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('The city keeps moving while you read.', x + w / 2, y + h - 12 * s);
      ctx.restore();
    },
  };
}
