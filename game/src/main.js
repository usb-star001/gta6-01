// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between seven screens: title, story,
// play, paused, missions, help and busted/wasted. Progress (money, jobs done,
// position, clock) saves to localStorage, so Continue picks up where the player
// left off.
//
// ?seed=N fixes the city and the traffic. ?shot=start|drive|chase|mission (with
// &seed=N) stages that scene instead of running the loop, paints it twice and
// sets window.__shotReady for a screenshot.

import { BEST_KEY, EVENT_BUSTED, EVENT_CRASH, EVENT_JINGLE, EVENT_PICKUP, EVENT_SHOT, EVENT_WASTED, SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createCity } from './city.js';
import { createWorld } from './world.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_MISSIONS, ACTION_MUTE, ACTION_PAUSE, ACTION_RELOAD, ACTION_STATS, createInput } from './input.js';
import { createAudio } from './audio.js';
import { SCREEN_HELP, SCREEN_MISSIONS, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_STORY, SCREEN_TITLE, TITLE_BUTTONS, createRenderer } from './render.js';
import { stageShot } from './shots.js';
import { createDayNight } from './daynight.js';
import { createRaces } from './races.js';
import { createCollectibles } from './collectibles.js';
import { createSideJobs } from './sidejobs.js';
import { createVehicles } from './vehicles.js';
import { createStats } from './stats.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
const MAX_FRAME = 0.25;
/** How often the game autosaves while playing, in seconds. */
const AUTOSAVE_SECONDS = 15;

const HUD_W = 1280;
const HUD_H = 720;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);
/** ?night=1 pins the day/night cycle to night (a staged screenshot). */
const nightParam = params.get('night') === '1';
/** ?race=1 stages a street race in progress (a staged screenshot). */
const raceParam = params.get('race') === '1';

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const random = createRandom(seed);
const city = createCity(random);
const world = createWorld(random, city);
const renderer = createRenderer(canvas);
const audio = createAudio();

// The Side Streets pack: five systems that run on the world's state and paint
// after the renderer — the day/night clock, street races, hidden packages,
// Rosa's delivery gigs and two special rides. They were written for this
// entry and live in their own files under game/src/.
const dayNight = createDayNight();
const races = createRaces(world.state);
const collectibles = createCollectibles(world.state);
const sideJobs = createSideJobs(world.state);
const vehicles = createVehicles(world.state);
const stats = createStats(world.state);

/** Paint the expansion systems over the renderer's frame, in screen pixels. */
function drawExpansionOverlays() {
  const ctx = canvas.getContext('2d');
  const worldScale = canvas.width / 1150;
  const cam = world.state.camera;
  const view = {
    scale: worldScale,
    width: canvas.width,
    height: canvas.height,
    toScreen(x, y) {
      return { x: (x - cam.x) * worldScale + canvas.width / 2, y: (y - cam.y) * worldScale + canvas.height / 2 };
    },
  };
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  dayNight.draw(ctx, world.state, view);
  races.draw(ctx, world.state, view);
  collectibles.draw(ctx, world.state, view);
  sideJobs.draw(ctx, world.state, view);
  vehicles.draw(ctx, world.state, view);
  stats.draw(ctx, world.state, view);
  ctx.restore();
}

// A small handle for automated playtests (and curious players): the world, the
// audio and the current screen, read-only from the console. It changes nothing
// in the game itself.
window.__nh = { world, audio, screen: () => 'boot' };

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best then lasts this visit only.
  }
}

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(world.getSave()));
  } catch {
    // See saveBest.
  }
}

/** HUD logical coordinates for a click in CSS pixels. */
function toHudCoords(cssX, cssY) {
  const ratio = window.devicePixelRatio || 1;
  const scale = Math.min(canvas.width / HUD_W, canvas.height / HUD_H);
  const ox = (canvas.width - HUD_W * scale) / 2;
  const oy = (canvas.height - HUD_H * scale) / 2;
  return { x: (cssX * ratio - ox) / scale, y: (cssY * ratio - oy) / scale };
}

/** World coordinates for the mouse, for aiming on foot. */
function toWorldCoords(cssX, cssY) {
  const ratio = window.devicePixelRatio || 1;
  const worldScale = canvas.width / 1150;
  const cam = world.state.camera;
  return {
    x: (cssX * ratio - canvas.width / 2) / worldScale + cam.x,
    y: (cssY * ratio - canvas.height / 2) / worldScale + cam.y,
  };
}

function runShot(name) {
  const scene = stageShot(name, world);
  window.__nh.screen = () => scene.screen;
  const ui = { best: scene.best, hasSave: true, muted: false };
  // Stage the expansion systems the shot asks for: night for the tint, a race
  // in progress for its checkpoints and timer on the objective line.
  if (nightParam) dayNight.setForced('night');
  if (raceParam) races.stageRace(0);
  dayNight.update(world.state, 0);
  // Paint synchronously, not only in requestAnimationFrame: a headless screenshot can
  // fire at load, before the first frame callback runs, and must still see the scene.
  renderer.draw(world.state, scene.screen, ui);
  renderer.draw(world.state, scene.screen, ui);
  drawExpansionOverlays();
  window.__shotReady = true;
  document.title = 'shot-ready';
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  window.__nh.screen = () => screen;
  let best = readBest();
  let save = readSave();
  let hasSave = save !== null;
  let accumulator = 0;
  let last = performance.now();
  let autosaveTimer = AUTOSAVE_SECONDS;
  let overTitle = 'Busted';
  let overLines = [''];
  /** One-shot presses for the sim (enter a car, reload), read once per frame here. */
  let pendingGameActions = 0;

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startNewGame() {
    audio.start();
    world.reset();
    races.reset();
    collectibles.reset();
    sideJobs.reset();
    vehicles.reset();
    stats.reset();
    save = null;
    hasSave = false;
    screen = SCREEN_STORY;
    announce('Port Azure. Mara Voss owes the harbour syndicate fifty thousand dollars.');
  }

  function continueGame() {
    audio.start();
    if (save) {
      world.reset();
      world.loadSave(save);
    }
    stats.reset();
    screen = SCREEN_PLAY;
    announce('Playing. Welcome back to Port Azure.');
  }

  function showOver(title, lines) {
    overTitle = title;
    overLines = lines;
    screen = SCREEN_OVER;
    if (world.state.money > best) {
      best = world.state.money;
      saveBest(best);
    }
    writeSave();
  }

  function handleTitleClick() {
    const mouse = input.mouse();
    const at = toHudCoords(mouse.x, mouse.y);
    for (const button of TITLE_BUTTONS) {
      if (at.x >= button.x && at.x <= button.x + button.w && at.y >= button.y && at.y <= button.y + button.h) {
        if (button.id === 'new') startNewGame();
        else if (button.id === 'continue' && hasSave) continueGame();
        else if (button.id === 'help') screen = SCREEN_HELP;
        return true;
      }
    }
    return false;
  }

  function handleActions() {
    const actions = input.takeActions();
    // Gameplay presses go to the sim's next step; the UI handles the rest here.
    // The queue is read exactly once per frame, so no press is ever eaten twice.
    pendingGameActions |= actions & (ACTION_ENTER | ACTION_RELOAD);
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) {
        audio.start();
        if (input.takeClick()) {
          if (handleTitleClick()) return;
        }
        if (hasSave) continueGame();
        else startNewGame();
      }
      return;
    }
    if (screen === SCREEN_STORY) {
      if (actions & ACTION_CONFIRM) {
        screen = SCREEN_PLAY;
        announce('Playing. Mara Voss, Port Azure. Press M for Eddie\'s jobs.');
      }
      return;
    }
    if (screen === SCREEN_HELP) {
      if (actions & ACTION_CONFIRM) screen = SCREEN_TITLE;
      return;
    }
    if (screen === SCREEN_OVER) {
      if (actions & ACTION_CONFIRM) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
      return;
    }
    if (screen === SCREEN_MISSIONS) {
      if (actions & ACTION_CONFIRM) {
        if (world.missions.startNext()) {
          screen = SCREEN_PLAY;
          announce('Job started.');
        }
      } else if (actions & (ACTION_PAUSE | ACTION_MISSIONS)) {
        screen = SCREEN_PLAY;
      }
      return;
    }
    if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
      return;
    }
    // SCREEN_PLAY.
    if (actions & ACTION_STATS) {
      const open = stats.toggle();
      announce(open ? "Records open. Press H to close." : 'Records closed.');
    }
    if (actions & ACTION_PAUSE) {
      screen = SCREEN_PAUSED;
      writeSave();
      announce('Paused.');
    } else if (actions & ACTION_MISSIONS) {
      screen = SCREEN_MISSIONS;
      announce("Eddie's jobs.");
    }
  }

  function handleEvents(events) {
    if (events & EVENT_SHOT) audio.gunshot();
    if (events & EVENT_CRASH) audio.crash();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_JINGLE) {
      audio.jingle();
      if (world.state.money > best) {
        best = world.state.money;
        saveBest(best);
      }
      writeSave();
    }
    if (events & EVENT_BUSTED) {
      audio.busted();
      showOver('Busted', [world.state.toast || 'The harbour police took you in.']);
    } else if (events & EVENT_WASTED) {
      audio.busted();
      showOver('Wasted', [world.state.toast || 'Mara is down.']);
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      // The title's backdrop: traffic moves, nothing touches the player.
      const mouseWorld = { x: world.state.player.x + 200, y: world.state.player.y };
      world.step(STEP, input, mouseWorld, null, 0);
      dayNight.update(world.state, STEP);
      world.state.camera.x = 1540 + Math.sin(world.state.time * 0.05) * 300;
      world.state.camera.y = 1100;
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const mouse = input.mouse();
    const mouseWorld = toWorldCoords(mouse.x, mouse.y);
    const actions = pendingGameActions;
    const events = world.step(STEP, input, mouseWorld, audio, actions);
    pendingGameActions = 0;
    // The expansion systems run on the same step, after the world: the clock
    // first (the others read its phase), then the races, packages, gigs and
    // rides. A story job and a gig or a race never run at once, so they never
    // fight over the map marker.
    const storyActive = world.missions.isActive();
    let extra = dayNight.update(world.state, STEP);
    extra |= races.update(world.state, STEP, actions, storyActive || sideJobs.isGigActive());
    extra |= collectibles.update(world.state, STEP);
    extra |= sideJobs.update(world.state, STEP, actions, storyActive || races.isActive(), world.missions.doneCount());
    extra |= vehicles.update(world.state, STEP, actions);
    stats.update(STEP);
    handleEvents(events | extra);
    autosaveTimer -= STEP;
    if (autosaveTimer <= 0) {
      autosaveTimer = AUTOSAVE_SECONDS;
      writeSave();
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, {
      best, hasSave, muted: audio.isMuted(), overTitle, overLines,
    });
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) drawExpansionOverlays();
  }

  // Leaving the tab pauses a running game and saves it.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      writeSave();
      announce('Paused.');
    }
  });
  window.addEventListener('beforeunload', () => {
    if (screen === SCREEN_PLAY) writeSave();
  });

  announce('Neon Harbor. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
