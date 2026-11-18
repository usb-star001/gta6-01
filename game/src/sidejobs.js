// Rosa the Broker's delivery gigs: repeatable parcel runs that open once Mara
// has proved herself on a story job. A gig is a pickup and a drop between two
// landmarks, paid on delivery, and a new one only appears when nothing else
// is using the map marker — so it never fights a story mission, a fare or a
// race. Rosa herself hangs around the Tower; the gold ring on the map is the
// parcel, not her. Her three story missions live in missions.js, in the same
// list as Eddie's, and unlock in order after them.

import { EVENT_PICKUP } from './config.js';

/** How close the player must be to pick up or drop off, in world units. */
const ARRIVE_RADIUS = 80;
/** Seconds to wait after a gig before the next one can appear. */
const GIG_COOLDOWN = 20;
/** The landmarks a parcel can travel between. */
const STOPS = ['docks', 'hotel', 'tower', 'park', 'vault', 'safehouse', 'warehouse', 'lighthouse'];

/** A random stop that is not the one given. */
function anotherStop(not) {
  let pick = not;
  while (pick === not) {
    pick = STOPS[Math.floor(Math.random() * STOPS.length)];
  }
  return pick;
}

export function createSideJobs(state) {
  /** The gig in progress, or null: { stage, pickup, drop, reward }. */
  let gig = null;
  let cooldown = 0;

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

  function spawnGig() {
    const pickup = STOPS[Math.floor(Math.random() * STOPS.length)];
    const drop = anotherStop(pickup);
    gig = {
      stage: 'pickup',
      pickup,
      drop,
      reward: 60 + Math.floor(Math.random() * 5) * 10,
    };
    // Tell the fare system a gig is running, so it does not spawn a fare and
    // steal the map marker from under it.
    state.gigActive = true;
    const at = state.city.landmarks[pickup];
    setMarker(at.x, at.y, 'Gig: pick up a parcel');
    setObjective('Gig: pick up a parcel for Rosa.');
  }

  function abortGig() {
    // A story job or a race took over: drop the gig quietly and leave the
    // marker alone — it belongs to the job now, not to the gig.
    gig = null;
    state.gigActive = false;
    cooldown = GIG_COOLDOWN;
  }

  return {
    reset() {
      gig = null;
      state.gigActive = false;
      cooldown = 0;
    },
    isGigActive() {
      return gig !== null;
    },
    /** The gig in progress, or null: its stage, stops and reward. */
    gigInfo() {
      return gig === null ? null : { ...gig };
    },
    update(state, dt, actions, blocked, doneCount) {
      if (blocked) {
        if (gig !== null) abortGig();
        return 0;
      }
      if (gig === null) {
        if (doneCount < 1) return 0;
        if (cooldown > 0) {
          cooldown -= dt;
          return 0;
        }
        // Only appear when the map marker is free — a fare or a mission may
        // already be using it, and the gig waits its turn.
        if (state.marker !== null) return 0;
        spawnGig();
        return 0;
      }
      const target = state.city.landmarks[gig.stage === 'pickup' ? gig.pickup : gig.drop];
      const d = Math.hypot(state.player.x - target.x, state.player.y - target.y);
      if (d >= ARRIVE_RADIUS) return 0;
      if (gig.stage === 'pickup') {
        gig.stage = 'drop';
        const dest = state.city.landmarks[gig.drop];
        setMarker(dest.x, dest.y, 'Gig: deliver the parcel');
        setObjective('Gig: deliver the parcel.');
        toast('Parcel aboard. Rosa pays on delivery — no detours.', 2.5);
        return 0;
      }
      state.money += gig.reward;
      toast(`Gig done — $${gig.reward} from Rosa. Another parcel is waiting out there.`, 3.5);
      gig = null;
      state.gigActive = false;
      cooldown = GIG_COOLDOWN;
      clearMarker();
      setObjective('The city is yours. Fares pay the bills — follow the $ markers.');
      return EVENT_PICKUP;
    },
    /** A gold ring on the parcel's stop, and Rosa's badge at the Tower. */
    draw(ctx, state, view) {
      if (gig !== null) {
        const target = state.city.landmarks[gig.stage === 'pickup' ? gig.pickup : gig.drop];
        const at = view.toScreen(target.x, target.y);
        if (at.x >= -40 && at.y >= -40 && at.x <= view.width + 40 && at.y <= view.height + 40) {
          const radius = (26 + 4 * Math.sin(state.time * 3)) * view.scale;
          ctx.beginPath();
          ctx.arc(at.x, at.y, radius, 0, Math.PI * 2);
          ctx.lineWidth = 3;
          ctx.strokeStyle = '#ffc53d';
          ctx.stroke();
          ctx.fillStyle = '#ffc53d';
          ctx.font = `bold ${Math.max(12, Math.round(16 * view.scale))}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('$', at.x, at.y);
        }
      }
      const rosa = view.toScreen(...Object.values(state.city.landmarks.tower));
      if (rosa.x < -40 || rosa.y < -40 || rosa.x > view.width + 40 || rosa.y > view.height + 40) return;
      ctx.beginPath();
      ctx.arc(rosa.x, rosa.y - 34 * view.scale, 13 * view.scale, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(20, 20, 30, 0.75)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#c084fc';
      ctx.stroke();
      ctx.fillStyle = '#e9d5ff';
      ctx.font = `bold ${Math.max(11, Math.round(14 * view.scale))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('R', rosa.x, rosa.y - 34 * view.scale);
    },
  };
}
