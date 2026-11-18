// The screenshot scenes behind ?shot=start|drive|chase|mission. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by a simple
// autopilot that keeps the car on its road (aim at a point ahead on the same road line),
// so the frame is what a short game really looks like and the same seed always gives
// the same frame.

import { ROADS, STEP } from './config.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 6;
const DRIVE_SECONDS = 5;
const CHASE_SECONDS = 5;
const MISSION_SECONDS = 3;

function fakeInput(steer) {
  return {
    forward() { return 1; },
    strafe() { return steer; },
    run() { return false; },
    handbrake() { return false; },
    mouse() { return { x: 640, y: 360, down: false }; },
    takeActions() { return 0; },
    takeClick() { return false; },
  };
}

/** The road line nearest to a value, from a list of centres. */
function nearestLine(value, lines) {
  let best = lines[0];
  for (const line of lines) if (Math.abs(line - value) < Math.abs(best - value)) best = line;
  return best;
}

/**
 * Steer toward a point 600 ahead on the road the car is already on, so the car stays
 * on the asphalt instead of cutting across blocks to chase a marker.
 */
function autopilot(car) {
  const horizontal = Math.abs(Math.cos(car.angle)) >= Math.abs(Math.sin(car.angle));
  let tx;
  let ty;
  if (horizontal) {
    const roadY = nearestLine(car.y, ROADS.horizontal);
    const lane = Math.max(-20, Math.min(20, car.y - roadY));
    tx = car.x + Math.sign(Math.cos(car.angle)) * 600;
    ty = roadY + lane;
  } else {
    const roadX = nearestLine(car.x, ROADS.vertical);
    const lane = Math.max(-20, Math.min(20, car.x - roadX));
    tx = roadX + lane;
    ty = car.y + Math.sign(Math.sin(car.angle)) * 600;
  }
  const want = Math.atan2(ty - car.y, tx - car.x);
  let diff = want - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return Math.max(-1, Math.min(1, diff * 1.6));
}

/** Put the player in the nearest parked car, moved to a road start. */
function putPlayerInCar(world, x, y, angle) {
  const state = world.state;
  let best = null;
  let bestD = Infinity;
  for (const car of state.cars) {
    if (!car.parked) continue;
    const d = Math.hypot(car.x - x, car.y - y);
    if (d < bestD) { best = car; bestD = d; }
  }
  if (!best) return null;
  best.x = x;
  best.y = y;
  best.angle = angle;
  best.parked = false;
  best.traffic = false;
  best.speed = 0;
  state.player.inCar = best;
  state.player.x = x;
  state.player.y = y;
  return best;
}

function runSteps(world, seconds) {
  const state = world.state;
  for (let i = 0; i < seconds / STEP; i += 1) {
    const steer = state.player.inCar ? autopilot(state.player.inCar) : 0;
    const mouseWorld = { x: state.player.x + 200, y: state.player.y };
    world.step(STEP, fakeInput(steer), mouseWorld, null);
  }
}

/**
 * Set `world` to the named scene (start, drive, chase or mission; any other name is
 * start) and return the screen to draw over it and the best bankroll to show.
 */
export function stageShot(name, world) {
  const state = world.state;
  world.reset();
  if (name !== 'drive' && name !== 'chase' && name !== 'mission') {
    state.clockHour = 17.6;
    runSteps(world, START_SECONDS);
    // Frame a busy intersection for the title's backdrop.
    state.camera.x = 1540;
    state.camera.y = 1100;
    return { screen: SCREEN_TITLE, best: 1240 };
  }
  if (name === 'drive') {
    state.clockHour = 10.2;
    putPlayerInCar(world, 420, 1120, 0);
    runSteps(world, DRIVE_SECONDS);
    return { screen: SCREEN_PLAY, best: 1240 };
  }
  if (name === 'chase') {
    state.clockHour = 21.4;
    putPlayerInCar(world, 420, 680, 0);
    state.wanted = 3;
    runSteps(world, CHASE_SECONDS);
    return { screen: SCREEN_PLAY, best: 1240 };
  }
  // mission: the first job, the client waiting at the Docks, golden hour. The car runs
  // west along the dock road toward the marker.
  state.clockHour = 17.9;
  world.missions.startNext();
  putPlayerInCar(world, 1900, 2440, Math.PI);
  runSteps(world, MISSION_SECONDS);
  return { screen: SCREEN_PLAY, best: 1240 };
}
