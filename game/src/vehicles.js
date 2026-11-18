// Two special rides parked in Port Azure: the Night Hawk motorcycle by the
// Safehouse and the Harbor Hauler truck at the Docks. Walk up and press E to
// take one, press E again to leave it. The bike is fast and loud; the truck is
// slow and heavy, but hauling pays by the minute — double after dark. The ride
// works by leaning on the player's own movement: each step it stretches the
// distance just covered, so the bike pulls ahead and the truck drags, without
// touching the world's driving. If the world moves the player a long way at
// once — waking up in hospital, say — the ride is over.

import { ACTION_ENTER } from './input.js';

/** How close the player must be to take a parked ride, in world units. */
const BOARD_RADIUS = 70;
/** A jump this big in one step means the world moved the player, not driving. */
const TELEPORT_DISTANCE = 400;
/** Seconds of hauling that earn one payout. */
const HAUL_TICK = 5;
/** Cash per haul tick, doubled after dark. */
const HAUL_PAY = 5;

/**
 * The rides. Each names a landmark plus an offset for its parking spot, a
 * speed factor applied to the distance the player covers each step, and the
 * line the game says when Mara takes it.
 */
const RIDES = [
  {
    id: 'hawk', name: 'Night Hawk', kind: 'motorcycle',
    at: 'safehouse', dx: 200, dy: 120, speedFactor: 1.6,
    blurb: 'You are on the Night Hawk — fast, loud, and hard to miss.',
  },
  {
    id: 'hauler', name: 'Harbor Hauler', kind: 'truck',
    at: 'docks', dx: -200, dy: 160, speedFactor: 0.85,
    blurb: 'You are hauling the Harbor Hauler — slow, heavy, and it pays by the minute.',
  },
];

/** World position of a ride's parking spot, from its landmark plus offset. */
function ridePos(state, ride) {
  const mark = state.city.landmarks[ride.at];
  return { x: mark.x + ride.dx, y: mark.y + ride.dy };
}

export function createVehicles(state) {
  /** The ride in use, or null: { ride, lastX, lastY, haulTimer }. */
  let riding = null;

  function toast(text, seconds) {
    state.toast = text;
    state.toastTimer = seconds || 4;
  }

  return {
    reset() {
      riding = null;
    },
    isRiding() {
      return riding !== null;
    },
    /** The ride in use, or null: its name, kind and speed factor. */
    ridingInfo() {
      return riding === null ? null : {
        name: riding.ride.name,
        kind: riding.ride.kind,
        speedFactor: riding.ride.speedFactor,
      };
    },
    update(state, dt, actions) {
      if (riding !== null) {
        const dx = state.player.x - riding.lastX;
        const dy = state.player.y - riding.lastY;
        const moved = Math.hypot(dx, dy);
        if (moved > TELEPORT_DISTANCE) {
          // The world moved the player — busted, wasted, a fresh start.
          riding = null;
          return 0;
        }
        if (moved > 0.2) {
          const extra = riding.ride.speedFactor - 1;
          state.player.x += dx * extra;
          state.player.y += dy * extra;
        }
        riding.lastX = state.player.x;
        riding.lastY = state.player.y;
        if (riding.ride.kind === 'truck') {
          riding.haulTimer += dt;
          if (riding.haulTimer >= HAUL_TICK) {
            riding.haulTimer -= HAUL_TICK;
            const night = state.dayPhase !== undefined && state.dayPhase.isNight;
            state.money += night ? HAUL_PAY * 2 : HAUL_PAY;
          }
        }
        if (actions & ACTION_ENTER) {
          toast(`You left the ${riding.ride.name}.`, 2.5);
          riding = null;
        }
        return 0;
      }
      if (!(actions & ACTION_ENTER)) return 0;
      for (const ride of RIDES) {
        const at = ridePos(state, ride);
        const d = Math.hypot(state.player.x - at.x, state.player.y - at.y);
        if (d < BOARD_RADIUS) {
          riding = { ride, lastX: state.player.x, lastY: state.player.y, haulTimer: 0 };
          toast(ride.blurb, 4);
          return 0;
        }
      }
      return 0;
    },
    /** The parked rides, drawn as their shapes with a name tag; a badge while riding. */
    draw(ctx, state, view) {
      for (const ride of RIDES) {
        if (riding !== null && riding.ride.id === ride.id) continue;
        const at = view.toScreen(...Object.values(ridePos(state, ride)));
        if (at.x < -60 || at.y < -60 || at.x > view.width + 60 || at.y > view.height + 60) continue;
        const s = view.scale;
        ctx.save();
        ctx.translate(at.x, at.y);
        if (ride.kind === 'motorcycle') {
          ctx.strokeStyle = '#f97316';
          ctx.lineWidth = Math.max(3, 4 * s);
          ctx.beginPath();
          ctx.moveTo(-16 * s, 6 * s);
          ctx.lineTo(16 * s, -6 * s);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(-14 * s, 8 * s, 6 * s, 0, Math.PI * 2);
          ctx.arc(14 * s, -4 * s, 6 * s, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = '#fdba74';
          ctx.beginPath();
          ctx.arc(0, 0, 3.5 * s, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = '#38bdf8';
          ctx.fillRect(-20 * s, -10 * s, 40 * s, 20 * s);
          ctx.fillStyle = '#0c4a6e';
          ctx.fillRect(8 * s, -7 * s, 12 * s, 14 * s);
          ctx.fillStyle = '#e0f2fe';
          ctx.fillRect(12 * s, -4 * s, 6 * s, 8 * s);
          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.arc(-12 * s, 11 * s, 4 * s, 0, Math.PI * 2);
          ctx.arc(12 * s, 11 * s, 4 * s, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        // The minimap sits in the bottom-right corner: a ride parked there
        // keeps its shape, but its name would read as a label on the minimap.
        if (at.x > view.width * 0.74 && at.y > view.height * 0.70) continue;
        ctx.fillStyle = 'rgba(10, 10, 18, 0.8)';
        ctx.font = `bold ${Math.max(11, Math.round(13 * s))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(ride.name, at.x, at.y + 30 * s);
      }
      if (riding !== null) {
        const at = view.toScreen(state.player.x, state.player.y - 46);
        ctx.fillStyle = 'rgba(10, 10, 18, 0.8)';
        const label = `Riding: ${riding.ride.name}`;
        ctx.font = `bold ${Math.max(11, Math.round(13 * view.scale))}px sans-serif`;
        const width = ctx.measureText(label).width + 16;
        ctx.fillRect(at.x - width / 2, at.y - 12 * view.scale, width, 22 * view.scale);
        ctx.fillStyle = riding.ride.kind === 'motorcycle' ? '#fdba74' : '#7dd3fc';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, at.x, at.y - 1 * view.scale);
      }
    },
  };
}
