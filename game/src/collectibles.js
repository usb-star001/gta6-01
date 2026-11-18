// Hidden packages: twelve parcels stashed around Port Azure — tucked behind
// the landmarks, halfway down the runs between them. Walk over one to pocket
// it; find all twelve and the syndicate's own stash pays out on top. They are
// saved on their own, apart from the world's save, so a fresh game hides them
// again while the race bests stay. After dark they glow brighter, which is
// when a careful driver does the collecting.

import { EVENT_JINGLE, EVENT_PICKUP } from './config.js';

/** How close the player must be to pick a package up, in world units. */
const PICKUP_RADIUS = 70;
/** Cash for one package. */
const PACKAGE_PAY = 25;
/** Bonus for finding every package. */
const SET_BONUS = 300;
/** localStorage key for the found flags. */
const FOUND_KEY = 'neon-harbor-packages';

/**
 * Twelve hiding spots: eight tucked near the landmarks, four halfway along
 * the runs between them. Each names a landmark plus an offset, or two
 * landmarks and a point between them, so the spots sit on the streets the
 * player already drives instead of inside a building.
 */
const SPOTS = [
  { at: 'docks', dx: 220, dy: -160 },
  { at: 'hotel', dx: -240, dy: 180 },
  { at: 'tower', dx: 260, dy: 120 },
  { at: 'park', dx: -180, dy: -200 },
  { at: 'vault', dx: 200, dy: 180 },
  { at: 'safehouse', dx: -220, dy: -140 },
  { at: 'warehouse', dx: 240, dy: -120 },
  { at: 'lighthouse', dx: -200, dy: 160 },
  { between: ['docks', 'hotel'], t: 0.5, dx: 60, dy: -120 },
  { between: ['tower', 'park'], t: 0.5, dx: -80, dy: 100 },
  { between: ['vault', 'warehouse'], t: 0.5, dx: 120, dy: 80 },
  { between: ['safehouse', 'lighthouse'], t: 0.5, dx: -100, dy: -90 },
];

/** World position of a hiding spot, from the landmarks it names. */
function spotPos(state, spot) {
  if (spot.between) {
    const a = state.city.landmarks[spot.between[0]];
    const b = state.city.landmarks[spot.between[1]];
    return {
      x: a.x + (b.x - a.x) * spot.t + spot.dx,
      y: a.y + (b.y - a.y) * spot.t + spot.dy,
    };
  }
  const mark = state.city.landmarks[spot.at];
  return { x: mark.x + spot.dx, y: mark.y + spot.dy };
}

function readFound() {
  try {
    const raw = window.localStorage.getItem(FOUND_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed) && parsed.length === SPOTS.length) return parsed;
  } catch {
    // Storage can be off: the set then lasts this visit only.
  }
  return SPOTS.map(() => false);
}

function writeFound(found) {
  try {
    window.localStorage.setItem(FOUND_KEY, JSON.stringify(found));
  } catch {
    // See readFound.
  }
}

export function createCollectibles(state) {
  let found = readFound();

  function toast(text, seconds) {
    state.toast = text;
    state.toastTimer = seconds || 4;
  }

  function count() {
    let n = 0;
    for (const f of found) if (f) n += 1;
    return n;
  }

  return {
    /** A fresh game hides the packages again. */
    reset() {
      found = SPOTS.map(() => false);
      try {
        window.localStorage.removeItem(FOUND_KEY);
      } catch {
        // See readFound.
      }
    },
    count() {
      return count();
    },
    total() {
      return SPOTS.length;
    },
    update(state) {
      for (let i = 0; i < SPOTS.length; i += 1) {
        if (found[i]) continue;
        const at = spotPos(state, SPOTS[i]);
        const d = Math.hypot(state.player.x - at.x, state.player.y - at.y);
        if (d >= PICKUP_RADIUS) continue;
        found[i] = true;
        writeFound(found);
        state.money += PACKAGE_PAY;
        const n = count();
        if (n >= SPOTS.length) {
          state.money += SET_BONUS;
          toast(`Last package — all ${SPOTS.length} found. $${PACKAGE_PAY} plus a $${SET_BONUS} stash bonus.`, 6);
          return EVENT_JINGLE;
        }
        toast(`Package found — $${PACKAGE_PAY}. ${n} of ${SPOTS.length} stashed away.`, 3.5);
        return EVENT_PICKUP;
      }
      return 0;
    },
    /** Gold diamonds, pulsing, brighter after dark, only where they still lie. */
    draw(ctx, state, view) {
      const night = state.dayPhase !== undefined && state.dayPhase.isNight;
      const pulse = 0.65 + 0.35 * Math.sin(state.time * 3);
      for (let i = 0; i < SPOTS.length; i += 1) {
        if (found[i]) continue;
        const at = view.toScreen(...Object.values(spotPos(state, SPOTS[i])));
        if (at.x < -30 || at.y < -30 || at.x > view.width + 30 || at.y > view.height + 30) continue;
        const r = (night ? 13 : 10) * view.scale;
        ctx.save();
        ctx.translate(at.x, at.y);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = night ? `rgba(255, 210, 90, ${0.55 + 0.45 * pulse})` : `rgba(255, 200, 60, ${0.35 + 0.45 * pulse})`;
        ctx.fillRect(-r / 1.4, -r / 1.4, r * 1.4, r * 1.4);
        ctx.lineWidth = 2;
        ctx.strokeStyle = night ? '#ffe08a' : 'rgba(255, 220, 110, 0.9)';
        ctx.strokeRect(-r / 1.4, -r / 1.4, r * 1.4, r * 1.4);
        ctx.restore();
      }
    },
  };
}
