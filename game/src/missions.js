// The story thread: three missions for Mara Voss, a getaway driver in Port Azure, plus
// repeatable fares once she has proved herself. A mission is a list of steps — go to a
// place, pick something up, lose the heat — with a marker on the map and a timer where the
// job is hot. The world calls update() every step; this module only steers the world's
// objective, marker and toast, and hands out the money.

import { EVENT_JINGLE, EVENT_PICKUP } from './config.js';

const ARRIVE_RADIUS = 80;

const STORY = [
  {
    id: 'fare', name: 'First Fare', reward: 150,
    brief: 'Pick up Eddie\'s client at the Docks. Take her to the Harbor Hotel, clean and quick.',
    steps: [
      { label: 'Pick up the client at the Docks', at: 'docks' },
      { label: 'Deliver the client to the Harbor Hotel', at: 'hotel' },
    ],
  },
  {
    id: 'getaway', name: 'The Getaway', reward: 300,
    brief: 'The Vault job went loud. Lose the cruisers and get back to the Safehouse.',
    steps: [
      { label: 'Get to the Vault', at: 'vault', onArrive: 'heat' },
      { label: 'Lose the heat — reach the Safehouse', at: 'safehouse', timer: 120 },
    ],
  },
  {
    id: 'harbor', name: 'Harbor Run', reward: 500,
    brief: 'One package, Warehouse 7 to Lighthouse Point. The police have a tip — expect company.',
    steps: [
      { label: 'Pick up the package at Warehouse 7', at: 'warehouse', onArrive: 'heat2' },
      { label: 'Deliver the package to Lighthouse Point', at: 'lighthouse', timer: 150 },
    ],
  },
];

export function createMissions(state) {
  let done = 0;
  let unlocked = 1;
  let active = null; // { index, step, timer }
  let fare = null; // { stage, x, y, label, reward }
  let fareCooldown = 0;

  function setObjective(text) {
    state.objective = text;
  }

  function setMarker(x, y, label) {
    state.marker = { x, y, label };
  }

  function clearMarker() {
    state.marker = null;
  }

  function toast(text, seconds) {
    state.toast = text;
    state.toastTimer = seconds || 4;
  }

  function storyStep() {
    return STORY[active.index].steps[active.step];
  }

  function applyStep() {
    const step = storyStep();
    const place = state.city.landmarks[step.at];
    setObjective(`${STORY[active.index].name}: ${step.label}`);
    setMarker(place.x, place.y, step.label);
    active.timer = step.timer || 0;
  }

  function startStory(index) {
    active = { index, step: 0 };
    fare = null;
    toast(STORY[index].brief, 6);
    applyStep();
  }

  function completeStory() {
    const mission = STORY[active.index];
    state.money += mission.reward;
    done += 1;
    unlocked = Math.min(STORY.length, done + 1);
    toast(`Mission complete: ${mission.name} — $${mission.reward} in the pocket.`, 5);
    active = null;
    clearMarker();
    setObjective(done >= STORY.length
      ? 'The city is yours. Fares pay the bills — follow the $ markers.'
      : 'Job done. Press M to take the next one.');
    if (done < STORY.length) maybeSpawnFare();
    return EVENT_JINGLE;
  }

  function failStory(reason) {
    toast(`Mission failed — ${reason} Talk to Eddie (M) to try again.`, 5);
    active = null;
    clearMarker();
    setObjective('The job is blown. Press M to try again.');
  }

  function maybeSpawnFare() {
    if (fare || done < 1) return;
    const roads = state.city.landmarks;
    const spots = [roads.hotel, roads.tower, roads.park, roads.docks];
    const spot = spots[Math.floor(Math.random() * spots.length)];
    fare = { stage: 'pickup', x: spot.x, y: spot.y, label: 'Fare: pick up a rider', reward: 40 + Math.floor(Math.random() * 5) * 10 };
    setMarker(fare.x, fare.y, fare.label);
  }

  function updateFare(dt) {
    if (!fare) return 0;
    const d = Math.hypot(state.player.x - fare.x, state.player.y - fare.y);
    if (d < ARRIVE_RADIUS) {
      if (fare.stage === 'pickup') {
        const dests = [state.city.landmarks.hotel, state.city.landmarks.tower, state.city.landmarks.park, state.city.landmarks.docks, state.city.landmarks.lighthouse];
        const dest = dests[Math.floor(Math.random() * dests.length)];
        fare = { stage: 'drop', x: dest.x, y: dest.y, label: 'Fare: drop the rider off', reward: fare.reward };
        setMarker(fare.x, fare.y, fare.label);
        setObjective('Fare: drop the rider off.');
        toast('Rider aboard. Drive smooth.', 2.5);
      } else {
        state.money += fare.reward;
        state.stats.faresDone += 1;
        toast(`Fare done — $${fare.reward}. Another rider is waiting out there.`, 3.5);
        fare = null;
        fareCooldown = 4;
        clearMarker();
        setObjective('The city is yours. Fares pay the bills — follow the $ markers.');
        return EVENT_PICKUP;
      }
    }
    return 0;
  }

  return {
    reset() {
      done = 0;
      unlocked = 1;
      active = null;
      fare = null;
      setObjective('Meet Eddie at the Safehouse — press M for missions');
      clearMarker();
    },
    load(doneCount, unlockedCount) {
      done = doneCount;
      unlocked = unlockedCount;
      active = null;
      fare = null;
      setObjective(done >= STORY.length
        ? 'The city is yours. Fares pay the bills — follow the $ markers.'
        : 'Press M to take the next job from Eddie.');
      if (done >= 1) maybeSpawnFare();
    },
    doneCount() {
      return done;
    },
    unlocked() {
      return unlocked;
    },
    isActive() {
      return active !== null;
    },
    activeMission() {
      return active === null ? null : { ...STORY[active.index], step: active.step, timer: active.timer };
    },
    list() {
      return STORY.map((m, i) => ({
        name: m.name, reward: m.reward, brief: m.brief,
        status: i < done ? 'done' : i < unlocked ? 'available' : 'locked',
      }));
    },
    /** Start the next available story mission, if any. Returns false when none is open. */
    startNext() {
      if (active !== null || done >= STORY.length || done >= unlocked) return false;
      startStory(done);
      return true;
    },
    abort(kind) {
      if (active !== null) {
        failStory(kind === 'busted' ? 'the police took you in. ' : 'you woke up in hospital. ');
      }
      fare = null;
      clearMarker();
    },
    update(dt) {
      if (active !== null) {
        const step = storyStep();
        if (active.timer > 0) {
          active.timer -= dt;
          if (active.timer <= 0) {
            failStory('time ran out. ');
            return 0;
          }
        }
        const place = state.city.landmarks[step.at];
        const d = Math.hypot(state.player.x - place.x, state.player.y - place.y);
        if (d < ARRIVE_RADIUS) {
          if (step.onArrive === 'heat') {
            state.wanted = 3;
            state.wantedTimer = 0;
            toast('The alarm is up! Three stars — lose them and reach the Safehouse.', 4);
          } else if (step.onArrive === 'heat2') {
            state.wanted = 2;
            state.wantedTimer = 0;
            toast('Package grabbed — and the harbour police are on you. Run it to the Lighthouse.', 4);
          }
          active.step += 1;
          if (active.step >= STORY[active.index].steps.length) return completeStory();
          applyStep();
        }
        return 0;
      }
      if (fare === null && done >= 1 && done < STORY.length) {
        if (fareCooldown > 0) fareCooldown -= dt;
        else maybeSpawnFare();
      }
      return updateFare(dt);
    },
  };
}
