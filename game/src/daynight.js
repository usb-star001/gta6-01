// The clock over Port Azure: one full day runs five minutes of game time,
// opening at dusk gold and sliding through night into dawn and day. The phase
// tints the world after the renderer paints it, and it gates the Night Run
// race, brightens the hidden packages after dark, and doubles the truck's haul
// pay at night. It reads only the world's clock, so a new game starts at dusk
// again and a saved game picks up where its clock left off.

/** Game seconds in one full day. */
const DAY_SECONDS = 300;
/** The game opens at dusk, so the clock starts partway round the day. */
const OPEN_OFFSET = 0.45;

/** Clamp a number into 0..1. */
function clamp01(value) {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * A smooth hill that is 0 outside [a, b], rises to 1 at the middle and falls
 * back to 0 — one coloured mood of the day, fading in and out.
 */
function hill(x, a, b) {
  if (x < a || x > b) return 0;
  const mid = (a + b) / 2;
  return x < mid ? (x - a) / (mid - a) : (b - x) / (b - mid);
}

/** Where the day is, as a fraction 0..1, from the world's clock. */
function timeOfDay(state) {
  return (((state.time / DAY_SECONDS) + OPEN_OFFSET) % 1 + 1) % 1;
}

export function createDayNight() {
  /** A phase forced by a URL flag (a staged screenshot), or null for live time. */
  let forced = null;

  function phase(state) {
    if (forced === 'night') {
      return { name: 'night', r: 12, g: 14, b: 46, alpha: 0.32, isNight: true };
    }
    if (forced === 'dusk') {
      return { name: 'dusk', r: 255, g: 120, b: 40, alpha: 0.14, isNight: false };
    }
    const t = timeOfDay(state);
    const night = hill(t, 0.55, 0.95);
    const dusk = hill(t, 0.40, 0.60);
    const dawn = Math.max(hill(t, 0.92, 1.0), hill(t, 0.0, 0.06));
    const r = Math.round(12 * night + 255 * dusk + 255 * dawn);
    const g = Math.round(14 * night + 120 * dusk + 150 * dawn);
    const b = Math.round(46 * night + 40 * dusk + 130 * dawn);
    const alpha = 0.32 * night + 0.14 * dusk + 0.10 * dawn;
    let name = 'day';
    if (night > 0.5) name = 'night';
    else if (dusk > 0.3) name = 'dusk';
    else if (dawn > 0.3) name = 'dawn';
    return { name, r, g, b, alpha, isNight: night > 0.5 };
  }

  return {
    /** Remember the current phase on the state for the other systems to read. */
    update(state) {
      state.dayPhase = phase(state);
      return 0;
    },
    /** The phase right now (name, tint colour and alpha, whether it is night). */
    phase(state) {
      return phase(state);
    },
    /** True while the city is dark enough for the Night Run. */
    isNight(state) {
      return phase(state).isNight;
    },
    /** Pin the phase (a staged screenshot), or pass null to follow the clock. */
    setForced(name) {
      forced = name;
    },
    /** Paint the tint, then a warm pool of light around the player after dark. */
    draw(ctx, state, view) {
      const p = state.dayPhase || phase(state);
      if (p.alpha > 0.01) {
        ctx.fillStyle = `rgba(${p.r}, ${p.g}, ${p.b}, ${p.alpha.toFixed(3)})`;
        ctx.fillRect(0, 0, view.width, view.height);
      }
      if (p.isNight) {
        const at = view.toScreen(state.player.x, state.player.y);
        const radius = 210 * view.scale;
        const glow = ctx.createRadialGradient(at.x, at.y, 10, at.x, at.y, radius);
        glow.addColorStop(0, 'rgba(255, 210, 120, 0.20)');
        glow.addColorStop(0.6, 'rgba(255, 190, 90, 0.07)');
        glow.addColorStop(1, 'rgba(255, 190, 90, 0)');
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = glow;
        ctx.fillRect(at.x - radius, at.y - radius, radius * 2, radius * 2);
        ctx.restore();
      }
    },
  };
}
