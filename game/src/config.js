// Neon Harbor tuning: every number and colour the game uses, in one place.
// The world is a fixed 3600x2800 city and the camera follows the player, so none
// of these values depends on the size of the screen.

export const WORLD = { width: 3600, height: 2800 };

/** Road grid: roads run down these centre lines, 96 wide, on a 440 pitch. */
export const ROADS = {
  pitch: 440,
  width: 96,
  vertical: [220, 660, 1100, 1540, 1980, 2420, 2860, 3300],
  horizontal: [220, 660, 1100, 1540, 1980, 2420],
  /** Below this line is the harbour water; piers are the only dry ground there. */
  waterY: 2560,
};

/** The simulation's fixed step, in seconds: 60 updates a second at any frame rate. */
export const STEP = 1 / 60;

/** One game minute passes per real second; the clock opens at dusk. */
export const CLOCK = { startHour: 17.6, minutesPerSecond: 1 };

export const PLAYER = {
  radius: 13,
  walkSpeed: 230,
  runSpeed: 330,
  health: 100,
  pistolMag: 12,
  reloadSeconds: 1.1,
  bulletSpeed: 900,
  bulletDamage: 34,
  fireCooldown: 0.16,
};

/** Cars are drawn big on purpose: the player's car must read clearly at a glance,
 *  in a chase, on the minimap and in a screenshot shrunk to a contact sheet. */
export const CAR = {
  length: 64,
  width: 30,
  radius: 24,
  accel: 420,
  reverseAccel: 300,
  maxSpeed: 520,
  maxReverse: 180,
  brake: 700,
  drag: 0.9,
  steerRate: 2.6,
  handbrakeDrag: 4.5,
};

export const TRAFFIC = {
  count: 14,
  speedMin: 130,
  speedMax: 210,
  colours: ['#c0392b', '#2980b9', '#f1c40f', '#7f8c8d', '#8e44ad', '#16a085', '#e67e22', '#ecf0f1'],
};

export const PED = {
  count: 22,
  radius: 10,
  speedMin: 45,
  speedMax: 80,
  health: 30,
};

export const POLICE = {
  maxCars: 4,
  carSpeed: 560,
  carRamDamage: 0,
  pedHealth: 60,
  pedSpeed: 200,
  pedShootRange: 320,
  pedShootCooldown: 0.9,
  pedBulletDamage: 7,
  bustSeconds: 1.5,
  spawnDistance: 700,
};

/** Wanted stars: what each crime adds, and how long quiet it takes to cool off. */
export const WANTED = {
  max: 5,
  jackCar: 1,
  shoot: 1,
  hitPed: 1,
  killPed: 1,
  /** Seconds with no crime and no police in sight before one star drops. */
  decaySeconds: 25,
};

export const MISSIONS = [
  { id: 'fare', name: 'First Fare', reward: 150 },
  { id: 'getaway', name: 'The Getaway', reward: 300 },
  { id: 'harbor', name: 'Harbor Run', reward: 500 },
];

/** Cash and health lying around the city. */
export const PICKUPS = {
  cashValue: 50,
  healthValue: 40,
};

export const PALETTE = {
  backdrop: '#0b0e14',
  grass: '#2e5d3a',
  park: '#3a7a45',
  sidewalk: '#8d9299',
  road: '#23262e',
  roadEdge: '#3a3e48',
  lane: '#d8c95a',
  water: '#14425e',
  waterDeep: '#0d2f45',
  buildingRoof: '#4a4f5c',
  buildingEdge: '#2c2f38',
  hudPanel: 'rgba(10, 12, 18, 0.72)',
  hudText: '#f2f4f7',
  hudMuted: '#9aa3b0',
  hudGold: '#f2c94c',
  hudRed: '#e5534b',
  hudGreen: '#4ade80',
  hudBlue: '#4fc3f7',
  marker: '#f2c94c',
  police: '#2f6df6',
  player: '#ff5d8f',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the save lives between visits (this browser only). */
export const SAVE_KEY = 'neon-harbor.save.v1';
export const BEST_KEY = 'neon-harbor.best.v1';

/** Step-result flags: what happened in one fixed step, for sounds and announcements. */
export const EVENT_SHOT = 1;
export const EVENT_CRASH = 2;
export const EVENT_PICKUP = 4;
export const EVENT_WASTED = 8;
export const EVENT_BUSTED = 16;
export const EVENT_JACK = 32;
export const EVENT_JINGLE = 64;
