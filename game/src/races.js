// Street races: three time trials strung between Port Azure's landmarks. A
// race starts at its checkered flag — walk up and press E — and the next
// checkpoint is marked on the map while the clock runs. Beat the par time and
// the payout lands; beat your best and it is remembered. The Night Run only
// opens after dark, when the harbour is at its quietest and the police are at
// their slowest to notice. A race never starts while a story job or a delivery
// gig is running, so it never fights the mission marker.

import { EVENT_JINGLE } from './config.js';
import { ACTION_ENTER } from './input.js';

/** How close the player must be to a checkpoint to clear it, in world units. */
const CHECKPOINT_RADIUS = 90;
/** How close the player must be to a race's start flag to join it. */
const START_RADIUS = 130;
/** Seconds past par before the race is called off. */
const GRACE_SECONDS = 60;
/** localStorage key for the best times, one per race. */
const BEST_KEY = 'neon-harbor-race-best';

/**
 * A race is a start flag and a run of checkpoints. Each checkpoint names a
 * landmark plus an offset from it, so the course threads the city's streets
 * instead of sitting on the mission spots.
 */
const RACES = [
  {
    id: 'sprint', name: 'Harbor Sprint', par: 75, reward: 120,
    start: { at: 'docks', dx: 160, dy: 120 },
    checkpoints: [
      { at: 'warehouse', dx: -140, dy: 90 },
      { at: 'tower', dx: 180, dy: -120 },
      { at: 'hotel', dx: -160, dy: 140 },
    ],
  },
  {
    id: 'loop', name: 'Uptown Loop', par: 120, reward: 200,
    start: { at: 'tower', dx: -200, dy: 160 },
    checkpoints: [
      { at: 'park', dx: 140, dy: -100 },
      { at: 'lighthouse', dx: -120, dy: 120 },
      { at: 'vault', dx: 160, dy: 100 },
      { at: 'tower', dx: 200, dy: -160 },
    ],
  },
  {
    id: 'night', name: 'Night Run', par: 100, reward: 250, nightOnly: true,
    start: { at: 'safehouse', dx: 180, dy: -140 },
    checkpoints: [
      { at: 'docks', dx: -180, dy: -100 },
      { at: 'warehouse', dx: 160, dy: -140 },
      { at: 'lighthouse', dx: 140, dy: -120 },
    ],
  },
];

function readBest() {
  try {
    const raw = window.localStorage.getItem(BEST_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeBest(best) {
  try {
    window.localStorage.setItem(BEST_KEY, JSON.stringify(best));
  } catch {
    // Storage can be off: the best then lasts this visit only.
  }
}

/** World position of a checkpoint, from its landmark plus its offset. */
function checkpointPos(state, point) {
  const mark = state.city.landmarks[point.at];
  return { x: mark.x + point.dx, y: mark.y + point.dy };
}

/** Format seconds as m:ss for the objective line. */
function clock(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export function createRaces(state) {
  /** The race in progress, or null: { race, index, elapsed }. */
  let active = null;
  let best = readBest();

  function toast(text, seconds) {
    state.toast = text;
    state.toastTimer = seconds || 4;
  }

  function setObjective(text) {
    state.objective = text;
  }

  function setMarker(x, y, label) {
    state.marker = { x, y, label };
  }

  function clearMarker() {
    state.marker = null;
  }

  function begin(index) {
    const race = RACES[index];
    active = { race, index: 0, elapsed: 0 };
    const first = checkpointPos(state, race.checkpoints[0]);
    setMarker(first.x, first.y, `${race.name}: checkpoint 1 of ${race.checkpoints.length}`);
    setObjective(`${race.name}: checkpoint 1 of ${race.checkpoints.length} — 0:00 / par ${clock(race.par)}`);
    toast(`${race.name} — go! Beat ${clock(race.par)} for $${race.reward}.`, 4);
  }

  function finish() {
    const race = active.race;
    const elapsed = active.elapsed;
    active = null;
    clearMarker();
    if (elapsed <= race.par) {
      state.money += race.reward;
      const previous = best[race.id];
      const isBest = previous === undefined || elapsed < previous;
      if (isBest) {
        best[race.id] = Math.round(elapsed * 10) / 10;
        writeBest(best);
      }
      toast(`${race.name} done in ${clock(elapsed)} — $${race.reward} in the pocket${isBest ? ', a new best.' : '.'}`, 5);
      setObjective('The city is yours. Fares pay the bills — follow the $ markers.');
      return EVENT_JINGLE;
    }
    toast(`${race.name} finished in ${clock(elapsed)} — over par ${clock(race.par)}, no payout. Run it again.`, 5);
    setObjective('The city is yours. Fares pay the bills — follow the $ markers.');
    return 0;
  }

  function fail() {
    const race = active.race;
    active = null;
    clearMarker();
    toast(`${race.name} called off — too slow. The flag is still there when you are ready.`, 5);
    setObjective('The city is yours. Fares pay the bills — follow the $ markers.');
  }

  return {
    reset() {
      active = null;
      clearMarker();
    },
    isActive() {
      return active !== null;
    },
    /** The race in progress, for the HUD: name, checkpoint and clock, or null. */
    activeInfo() {
      if (active === null) return null;
      return {
        name: active.race.name,
        index: active.index,
        total: active.race.checkpoints.length,
        elapsed: active.elapsed,
        par: active.race.par,
      };
    },
    /** Best times by race id, in seconds. */
    bestTimes() {
      return { ...best };
    },
    /** Stage a race for a screenshot: it is running at its first checkpoint. */
    stageRace(index) {
      begin(index);
      active.elapsed = 12.5;
      active.index = 0;
      const first = checkpointPos(state, active.race.checkpoints[0]);
      setMarker(first.x, first.y, `${active.race.name}: checkpoint 1 of ${active.race.checkpoints.length}`);
      setObjective(`${active.race.name}: checkpoint 1 of ${active.race.checkpoints.length} — 0:12 / par ${clock(active.race.par)}`);
    },
    update(state, dt, actions, blocked) {
      if (active !== null) {
        active.elapsed += dt;
        const race = active.race;
        if (active.elapsed > race.par + GRACE_SECONDS) {
          fail();
          return 0;
        }
        const next = checkpointPos(state, race.checkpoints[active.index]);
        const d = Math.hypot(state.player.x - next.x, state.player.y - next.y);
        if (d < CHECKPOINT_RADIUS) {
          active.index += 1;
          if (active.index >= race.checkpoints.length) return finish();
          const following = checkpointPos(state, race.checkpoints[active.index]);
          setMarker(following.x, following.y, `${race.name}: checkpoint ${active.index + 1} of ${race.checkpoints.length}`);
          setObjective(`${race.name}: checkpoint ${active.index + 1} of ${race.checkpoints.length} — ${clock(active.elapsed)} / par ${clock(race.par)}`);
          toast(`Checkpoint ${active.index} of ${race.checkpoints.length} — ${clock(active.elapsed)}.`, 2);
        } else {
          setObjective(`${race.name}: checkpoint ${active.index + 1} of ${race.checkpoints.length} — ${clock(active.elapsed)} / par ${clock(race.par)}`);
        }
        return 0;
      }
      if (blocked) return 0;
      if (!(actions & ACTION_ENTER)) return 0;
      for (let i = 0; i < RACES.length; i += 1) {
        const race = RACES[i];
        const start = checkpointPos(state, race.start);
        const d = Math.hypot(state.player.x - start.x, state.player.y - start.y);
        if (d < START_RADIUS) {
          if (race.nightOnly && !(state.dayPhase && state.dayPhase.isNight)) {
            toast('The Night Run only runs after dark. Come back when the lamps are on.', 4);
            return 0;
          }
          begin(i);
          return 0;
        }
      }
      return 0;
    },
    /** Checkered flags at the starts, numbered rings on the course. */
    draw(ctx, state, view) {
      if (active !== null) {
        const race = active.race;
        for (let i = active.index; i < race.checkpoints.length; i += 1) {
          const at = view.toScreen(...Object.values(checkpointPos(state, race.checkpoints[i])));
          const isNext = i === active.index;
          const radius = (isNext ? 34 : 24) * view.scale;
          ctx.beginPath();
          ctx.arc(at.x, at.y, radius, 0, Math.PI * 2);
          ctx.fillStyle = isNext ? 'rgba(80, 255, 140, 0.20)' : 'rgba(80, 255, 140, 0.08)';
          ctx.fill();
          ctx.lineWidth = isNext ? 3 : 2;
          ctx.strokeStyle = isNext ? '#50ff8c' : 'rgba(80, 255, 140, 0.55)';
          ctx.stroke();
          ctx.fillStyle = isNext ? '#50ff8c' : 'rgba(80, 255, 140, 0.8)';
          ctx.font = `bold ${Math.max(13, Math.round(18 * view.scale))}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(i + 1), at.x, at.y);
        }
        return;
      }
      for (const race of RACES) {
        const start = checkpointPos(state, race.start);
        const at = view.toScreen(start.x, start.y);
        if (at.x < -40 || at.y < -40 || at.x > view.width + 40 || at.y > view.height + 40) continue;
        const locked = race.nightOnly && !(state.dayPhase && state.dayPhase.isNight);
        ctx.fillStyle = locked ? 'rgba(120, 120, 130, 0.9)' : '#f5f5f5';
        ctx.fillRect(at.x - 2, at.y - 26 * view.scale, 3, 26 * view.scale);
        ctx.beginPath();
        ctx.moveTo(at.x + 1, at.y - 26 * view.scale);
        ctx.lineTo(at.x + 22 * view.scale, at.y - 20 * view.scale);
        ctx.lineTo(at.x + 1, at.y - 14 * view.scale);
        ctx.closePath();
        ctx.fillStyle = locked ? 'rgba(120, 120, 130, 0.9)' : '#111827';
        ctx.fill();
        // The minimap sits in the bottom-right corner: a flag there keeps its
        // pole, but its name would read as a label on the minimap.
        if (at.x > view.width * 0.74 && at.y > view.height * 0.70) continue;
        ctx.fillStyle = locked ? 'rgba(160, 160, 170, 0.9)' : '#f5f5f5';
        ctx.font = `bold ${Math.max(11, Math.round(14 * view.scale))}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(race.name, at.x - 14 * view.scale, at.y + 16 * view.scale);
      }
    },
  };
}
