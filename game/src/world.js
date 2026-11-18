// The game's rules and state, with no drawing and no browser in it: the player on foot
// and in cars, traffic, pedestrians, police, the wanted level, combat, pickups, particles
// and the clock. step() advances one fixed step and returns what happened as bit flags,
// so the caller can react (sounds, announcements) without the world knowing about them.
// Missions live in missions.js and steer the world through the hooks below.

import { CAR, CLOCK, EVENT_BUSTED, EVENT_CRASH, EVENT_JACK, EVENT_JINGLE, EVENT_PICKUP, EVENT_SHOT, EVENT_WASTED, MISSIONS, PED, PLAYER, POLICE, ROADS, STEP, TRAFFIC, WANTED, WORLD } from './config.js';
import { hitBuilding, inWater, nearestRoad, onRoad, onSidewalk } from './city.js';
import { ACTION_ENTER, ACTION_RELOAD } from './input.js';
import { createMissions } from './missions.js';
import { intBetween, pick } from './random.js';

export { EVENT_BUSTED, EVENT_CRASH, EVENT_JACK, EVENT_JINGLE, EVENT_PICKUP, EVENT_SHOT, EVENT_WASTED } from './config.js';

function circleRectOverlap(cx, cy, r, rect) {
  const nx = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

function pushOutOfBuildings(city, body, r) {
  const b = hitBuilding(city, body.x, body.y, r);
  if (!b) return false;
  const left = body.x + r - b.x;
  const right = b.x + b.w - (body.x - r);
  const top = body.y + r - b.y;
  const bottom = b.y + b.h - (body.y - r);
  const min = Math.min(left, right, top, bottom);
  if (min === left) body.x = b.x - r;
  else if (min === right) body.x = b.x + b.w + r;
  else if (min === top) body.y = b.y - r;
  else body.y = b.y + b.h + r;
  return true;
}

function clampToWorld(body, margin) {
  body.x = Math.max(margin, Math.min(WORLD.width - margin, body.x));
  body.y = Math.max(margin, Math.min(WORLD.height - margin, body.y));
}

export function createWorld(random, city) {
  const player = {
    x: city.landmarks.safehouse.x, y: city.landmarks.safehouse.y + 60,
    angle: -Math.PI / 2, speed: 0, health: PLAYER.health,
    ammo: PLAYER.pistolMag, reload: 0, fireCooldown: 0,
    inCar: null, shootingSpree: 0, bustTimer: 0, dead: false,
  };
  const state = {
    player, city, random,
    cars: [], peds: [], policeCars: [], policePeds: [],
    bullets: [], particles: [], pickups: [],
    wanted: 0, wantedTimer: 0, money: 0,
    clockHour: CLOCK.startHour,
    camera: { x: player.x, y: player.y },
    objective: 'Meet Eddie at the Safehouse — press M for missions',
    marker: null,
    toast: null, toastTimer: 0,
    stats: { kills: 0, carsStolen: 0, missionsDone: 0, faresDone: 0 },
    time: 0,
  };

  const missions = createMissions(state);
  state.missions = missions;

  function addParticle(x, y, vx, vy, life, colour, size) {
    state.particles.push({ x, y, vx, vy, life, maxLife: life, colour, size });
    if (state.particles.length > 220) state.particles.splice(0, state.particles.length - 220);
  }

  function burst(x, y, colour, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const a = random() * Math.PI * 2;
      const s = speed * (0.4 + random() * 0.8);
      addParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.4 + random() * 0.4, colour, 2 + random() * 3);
    }
  }

  function makeCar(x, y, angle, opts) {
    return {
      x, y, angle, speed: 0, colour: opts.colour || pick(random, TRAFFIC.colours),
      traffic: !!opts.traffic, police: !!opts.police, parked: !!opts.parked,
      driver: !!opts.driver, axis: opts.axis || 'h', at: opts.at || y,
      lane: opts.lane || 0, dir: opts.dir || 1,
      targetSpeed: opts.targetSpeed || 0, health: 100,
    };
  }

  function spawnTraffic() {
    for (let i = 0; i < TRAFFIC.count; i += 1) {
      const vertical = random() < 0.5;
      let x; let y; let axis; let at;
      if (vertical) {
        at = pick(random, ROADS.vertical);
        x = at + (random() < 0.5 ? -20 : 20);
        y = 100 + random() * (ROADS.waterY - 200);
        axis = 'v';
      } else {
        at = pick(random, ROADS.horizontal);
        y = at + (random() < 0.5 ? -20 : 20);
        x = 100 + random() * (WORLD.width - 200);
        axis = 'h';
      }
      const dir = random() < 0.5 ? 1 : -1;
      const car = makeCar(x, y, axis === 'h' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2), {
        traffic: true, driver: true, axis, at, lane: (random() < 0.5 ? -20 : 20),
        dir, targetSpeed: TRAFFIC.speedMin + random() * (TRAFFIC.speedMax - TRAFFIC.speedMin),
      });
      car.speed = car.targetSpeed;
      state.cars.push(car);
    }
  }

  function spawnParkedCars() {
    for (const spot of city.parkedSpots) {
      state.cars.push(makeCar(spot.x, spot.y, spot.angle, { parked: true }));
    }
  }

  function spawnPeds() {
    for (let i = 0; i < PED.count; i += 1) {
      const rx = pick(random, ROADS.vertical);
      const ry = pick(random, ROADS.horizontal);
      const onVertical = random() < 0.5;
      const x = onVertical ? rx + (random() < 0.5 ? -1 : 1) * (ROADS.width / 2 + 10) : 100 + random() * (WORLD.width - 200);
      const y = onVertical ? 100 + random() * (ROADS.waterY - 200) : ry + (random() < 0.5 ? -1 : 1) * (ROADS.width / 2 + 10);
      state.peds.push({
        x, y, angle: random() * Math.PI * 2, speed: PED.speedMin + random() * (PED.speedMax - PED.speedMin),
        health: PED.health, flee: 0, tx: x, ty: y, colour: pick(random, ['#e8b04b', '#7fb069', '#c06c84', '#6a8caf', '#d9d9d9']),
        police: false, shootCooldown: 0,
      });
    }
  }

  function spawnPickups() {
    const spots = [
      { x: city.landmarks.hospital.x + 40, y: city.landmarks.hospital.y + 40, kind: 'health' },
      { x: city.landmarks.park.x, y: city.landmarks.park.y, kind: 'health' },
      { x: city.landmarks.docks.x + 120, y: city.landmarks.docks.y, kind: 'cash' },
      { x: 2860, y: 1980, kind: 'cash' },
      { x: 660, y: 1980, kind: 'cash' },
      { x: 3300, y: 1100, kind: 'health' },
    ];
    for (const s of spots) state.pickups.push({ ...s, taken: false, bob: random() * 6 });
  }

  function addWanted(amount) {
    if (amount <= 0) return;
    state.wanted = Math.min(WANTED.max, state.wanted + amount);
    state.wantedTimer = 0;
  }

  function nearestPoliceDistance() {
    let best = null;
    for (const car of state.policeCars) {
      const d = Math.hypot(car.x - player.x, car.y - player.y);
      if (best === null || d < best) best = d;
    }
    return best;
  }

  function spawnPoliceCar() {
    // A road point some distance from the player, so the siren arrives before the car.
    const angle = random() * Math.PI * 2;
    const dist = POLICE.spawnDistance + random() * 300;
    let x = player.x + Math.cos(angle) * dist;
    let y = player.y + Math.sin(angle) * dist;
    x = Math.max(120, Math.min(WORLD.width - 120, x));
    y = Math.max(120, Math.min(ROADS.waterY - 120, y));
    const road = nearestRoad(x, y);
    if (road.axis === 'v') { x = road.at; } else { y = road.at; }
    const car = makeCar(x, y, 0, { police: true, colour: '#1c1c22' });
    car.speed = POLICE.carSpeed * 0.7;
    state.policeCars.push(car);
  }

  function spawnPolicePed() {
    const angle = random() * Math.PI * 2;
    const x = Math.max(60, Math.min(WORLD.width - 60, player.x + Math.cos(angle) * 260));
    const y = Math.max(60, Math.min(ROADS.waterY - 60, player.y + Math.sin(angle) * 260));
    state.policePeds.push({
      x, y, angle, speed: POLICE.pedSpeed, health: POLICE.pedHealth,
      flee: 0, tx: x, ty: y, colour: '#2f6df6', police: true, shootCooldown: 1 + random(),
    });
  }

  function respawnAfterTrouble(kind) {
    const penalty = Math.min(state.money, Math.max(50, Math.floor(state.money * 0.1)));
    state.money -= penalty;
    state.wanted = 0;
    state.wantedTimer = 0;
    state.policeCars.length = 0;
    state.policePeds.length = 0;
    if (player.inCar) player.inCar = null;
    player.x = city.landmarks.hospital.x;
    player.y = city.landmarks.hospital.y + 60;
    player.health = PLAYER.health;
    player.ammo = PLAYER.pistolMag;
    player.reload = 0;
    player.bustTimer = 0;
    player.dead = false;
    missions.abort(kind);
    state.toast = kind === 'busted'
      ? `BUSTED — the harbour police took $${penalty}. You wake up at St. Anselm Hospital.`
      : `WASTED — you wake up at St. Anselm Hospital, $${penalty} lighter.`;
    state.toastTimer = 5;
  }

  function shootBullet(fromX, fromY, angle, fromPlayer, damage) {
    const spread = fromPlayer ? 0.02 : 0.14;
    const a = angle + (random() - 0.5) * 2 * spread;
    state.bullets.push({
      x: fromX + Math.cos(a) * 22, y: fromY + Math.sin(a) * 22,
      vx: Math.cos(a) * PLAYER.bulletSpeed, vy: Math.sin(a) * PLAYER.bulletSpeed,
      fromPlayer, damage, life: 1.2,
    });
    addParticle(fromX + Math.cos(a) * 24, fromY + Math.sin(a) * 24, 0, 0, 0.08, '#ffd76a', 5);
  }

  function playerShoot(mouseWorld) {
    if (player.fireCooldown > 0 || player.reload > 0 || player.inCar) return 0;
    if (player.ammo <= 0) {
      player.reload = PLAYER.reloadSeconds;
      return 0;
    }
    player.ammo -= 1;
    player.fireCooldown = PLAYER.fireCooldown;
    if (player.shootingSpree <= 0) addWanted(WANTED.shoot);
    player.shootingSpree = 2;
    const angle = Math.atan2(mouseWorld.y - player.y, mouseWorld.x - player.x);
    player.angle = angle;
    shootBullet(player.x, player.y, angle, true, PLAYER.bulletDamage);
    return EVENT_SHOT;
  }

  function enterCar() {
    if (player.inCar) {
      const car = player.inCar;
      player.inCar = null;
      player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
      player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
      player.angle = car.angle;
      pushOutOfBuildings(city, player, PLAYER.radius);
      return 0;
    }
    let best = null;
    let bestD = 78;
    for (const car of state.cars) {
      const d = Math.hypot(car.x - player.x, car.y - player.y);
      if (d < bestD) { best = car; bestD = d; }
    }
    if (!best) return 0;
    if (best.police) return 0;
    player.inCar = best;
    best.parked = false;
    if (best.traffic && best.driver) {
      best.traffic = false;
      best.driver = false;
      state.stats.carsStolen += 1;
      addWanted(WANTED.jackCar);
      // The driver legs it.
      state.peds.push({
        x: best.x + 30, y: best.y + 30, angle: random() * Math.PI * 2,
        speed: PED.speedMax + 60, health: PED.health, flee: 4, tx: best.x + 300, ty: best.y + 300,
        colour: '#d9d9d9', police: false, shootCooldown: 0,
      });
      state.toast = 'You jacked the car! The driver ran — and somebody called it in.';
      state.toastTimer = 3;
      return EVENT_JACK;
    }
    if (best.traffic) best.traffic = false;
    return 0;
  }

  function updatePlayerOnFoot(dt, input, mouseWorld) {
    const fwd = input.forward();
    const str = input.strafe();
    const speed = input.run() ? PLAYER.runSpeed : PLAYER.walkSpeed;
    let mx = 0;
    let my = 0;
    if (fwd !== 0 || str !== 0) {
      // Movement is camera-relative: up is north on the map.
      mx = str;
      my = -fwd;
      const len = Math.hypot(mx, my);
      mx /= len;
      my /= len;
      player.x += mx * speed * dt;
      player.y += my * speed * dt;
      player.speed = speed;
    } else {
      player.speed = 0;
    }
    player.angle = Math.atan2(mouseWorld.y - player.y, mouseWorld.x - player.x);
    if (pushOutOfBuildings(city, player, PLAYER.radius)) player.speed = 0;
    if (inWater(city, player.x, player.y)) {
      // The harbour is not for swimming: push back to the dock edge.
      player.y = ROADS.waterY - PLAYER.radius - 1;
    }
    clampToWorld(player, PLAYER.radius + 4);
    if (player.fireCooldown > 0) player.fireCooldown -= dt;
    if (player.reload > 0) {
      player.reload -= dt;
      if (player.reload <= 0) player.ammo = PLAYER.pistolMag;
    }
    if (player.shootingSpree > 0) player.shootingSpree -= dt;
    if (input.mouse().down) return playerShoot(mouseWorld);
    return 0;
  }

  function updatePlayerDriving(dt, input) {
    const car = player.inCar;
    const fwd = input.forward();
    const str = input.strafe();
    const handbrake = input.handbrake();
    if (fwd > 0) car.speed += CAR.accel * dt;
    else if (fwd < 0) {
      if (car.speed > 10) car.speed -= CAR.brake * dt;
      else car.speed -= CAR.reverseAccel * dt;
    } else {
      car.speed -= Math.sign(car.speed) * CAR.drag * 60 * dt;
      if (Math.abs(car.speed) < 8) car.speed = 0;
    }
    if (handbrake) {
      car.speed -= Math.sign(car.speed) * CAR.handbrakeDrag * 60 * dt;
      if (Math.abs(car.speed) < 20) car.speed = 0;
      if (random() < 0.3) addParticle(car.x, car.y, 0, 0, 0.4, '#9aa3b0', 3);
    }
    car.speed = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, car.speed));
    const steerAmount = str * CAR.steerRate * dt * Math.min(1, Math.abs(car.speed) / 120 + 0.25);
    car.angle += (car.speed >= 0 ? steerAmount : -steerAmount);
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    const before = { x: car.x, y: car.y };
    car.x = nx;
    car.y = ny;
    if (pushOutOfBuildings(city, car, CAR.radius)) {
      if (Math.abs(car.speed) > 240) {
        burst(car.x, car.y, '#ffb347', 10, 160);
        car.speed *= -0.25;
        return EVENT_CRASH;
      }
      car.speed *= 0.4;
    }
    if (inWater(city, car.x, car.y)) {
      car.x = before.x;
      car.y = before.y;
      car.speed *= -0.3;
    }
    clampToWorld(car, CAR.radius + 4);
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    player.speed = Math.abs(car.speed);
    return 0;
  }

  function updateTraffic(dt) {
    for (const car of state.cars) {
      if (!car.traffic) continue;
      // Slow for the car ahead in the same lane.
      let ahead = null;
      for (const other of state.cars) {
        if (other === car || !other.traffic || other.axis !== car.axis || other.lane !== car.lane || other.dir !== car.dir) continue;
        const along = car.axis === 'h' ? (other.x - car.x) * car.dir : (other.y - car.y) * car.dir;
        if (along > 0 && along < 90 && (ahead === null || along < ahead)) ahead = along;
      }
      const target = ahead === null ? car.targetSpeed : Math.min(car.targetSpeed, 60);
      car.speed += Math.sign(target - car.speed) * 240 * dt;
      if (Math.abs(car.speed - target) < 5) car.speed = target;
      const stepLen = car.speed * car.dir * dt;
      if (car.axis === 'h') car.x += stepLen;
      else car.y += stepLen;
      car.angle = car.axis === 'h' ? (car.dir > 0 ? 0 : Math.PI) : (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      // At an intersection, sometimes turn onto the crossing road.
      const crossings = car.axis === 'h' ? ROADS.vertical : ROADS.horizontal;
      for (const c of crossings) {
        const pos = car.axis === 'h' ? car.x : car.y;
        if (Math.abs(pos - c) < car.speed * dt + 2 && random() < 0.3) {
          if (car.axis === 'h') { car.y = c; car.axis = 'v'; car.at = c; }
          else { car.x = c; car.axis = 'h'; car.at = c; }
          car.dir = random() < 0.5 ? 1 : -1;
          car.lane = random() < 0.5 ? -20 : 20;
          break;
        }
      }
      // Turn around at the edge of the drivable city.
      if (car.axis === 'h' && (car.x < 120 || car.x > WORLD.width - 120)) car.dir *= -1;
      if (car.axis === 'v' && (car.y < 120 || car.y > ROADS.waterY - 120)) car.dir *= -1;
      if (car.axis === 'v') car.x = car.at + car.lane;
      else car.y = car.at + car.lane;
      clampToWorld(car, CAR.radius + 4);
    }
  }

  function updatePeds(dt) {
    for (const ped of state.peds) {
      const dx = ped.tx - ped.x;
      const dy = ped.ty - ped.y;
      const dist = Math.hypot(dx, dy);
      if (ped.flee > 0) {
        ped.flee -= dt;
      } else if (dist < 24) {
        // Pick a new stroll target on a sidewalk somewhere nearby.
        const rx = pick(random, ROADS.vertical);
        const ry = pick(random, ROADS.horizontal);
        if (random() < 0.5) {
          ped.tx = rx + (random() < 0.5 ? -1 : 1) * (ROADS.width / 2 + 10);
          ped.ty = Math.max(80, Math.min(ROADS.waterY - 80, ped.y + (random() - 0.5) * 700));
        } else {
          ped.tx = Math.max(80, Math.min(WORLD.width - 80, ped.x + (random() - 0.5) * 700));
          ped.ty = ry + (random() < 0.5 ? -1 : 1) * (ROADS.width / 2 + 10);
        }
      }
      const speed = ped.flee > 0 ? ped.speed * 1.8 : ped.speed;
      if (dist > 4) {
        ped.angle = Math.atan2(dy, dx);
        ped.x += Math.cos(ped.angle) * speed * dt;
        ped.y += Math.sin(ped.angle) * speed * dt;
      }
      pushOutOfBuildings(city, ped, PED.radius);
      if (inWater(city, ped.x, ped.y)) ped.y = ROADS.waterY - PED.radius - 1;
      clampToWorld(ped, PED.radius + 4);
      if (ped.shootCooldown > 0) ped.shootCooldown -= dt;
    }
  }

  function updatePolice(dt) {
    // How many the heat calls for.
    const wantCars = state.wanted === 0 ? 0 : Math.min(POLICE.maxCars, state.wanted >= 4 ? 4 : state.wanted + 1);
    while (state.policeCars.length < wantCars) spawnPoliceCar();
    if (state.wanted === 0) state.policeCars.length = 0;
    for (let i = state.policeCars.length - 1; i >= 0; i -= 1) {
      const car = state.policeCars[i];
      const dx = player.x - car.x;
      const dy = player.y - car.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 1500) {
        state.policeCars.splice(i, 1);
        continue;
      }
      const wantAngle = Math.atan2(dy, dx);
      let diff = wantAngle - car.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      car.angle += Math.max(-2.8 * dt, Math.min(2.8 * dt, diff));
      const targetSpeed = dist > 120 ? POLICE.carSpeed : POLICE.carSpeed * 0.45;
      car.speed += Math.sign(targetSpeed - car.speed) * 500 * dt;
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      if (pushOutOfBuildings(city, car, CAR.radius)) car.speed *= 0.5;
      clampToWorld(car, CAR.radius + 4);
      // Ramming the player's car shoves it.
      if (player.inCar && dist < CAR.radius * 2 + 6) {
        const pc = player.inCar;
        pc.x += Math.cos(car.angle) * 60 * dt * 10;
        pc.y += Math.sin(car.angle) * 60 * dt * 10;
      }
    }

    const wantPeds = state.wanted >= 2 && !player.inCar ? Math.min(3, state.wanted - 1) : 0;
    while (state.policePeds.length < wantPeds) spawnPolicePed();
    if (state.wanted < 2 || player.inCar) state.policePeds.length = 0;
    for (const ped of state.policePeds) {
      const dx = player.x - ped.x;
      const dy = player.y - ped.y;
      const dist = Math.hypot(dx, dy);
      ped.angle = Math.atan2(dy, dx);
      if (dist > 40) {
        ped.x += Math.cos(ped.angle) * ped.speed * dt;
        ped.y += Math.sin(ped.angle) * ped.speed * dt;
      }
      pushOutOfBuildings(city, ped, PED.radius);
      clampToWorld(ped, PED.radius + 4);
      if (dist < POLICE.pedShootRange && ped.shootCooldown <= 0) {
        ped.shootCooldown = POLICE.pedShootCooldown;
        shootBullet(ped.x, ped.y, ped.angle, false, POLICE.pedBulletDamage);
      }
      // A cop on top of the player on foot is an arrest.
      if (dist < 36) {
        player.bustTimer += dt;
        if (player.bustTimer >= POLICE.bustSeconds) return EVENT_BUSTED;
      }
    }
    // A police car pinning the player on foot is an arrest too.
    if (!player.inCar && state.wanted > 0) {
      for (const car of state.policeCars) {
        if (Math.hypot(car.x - player.x, car.y - player.y) < 40) {
          player.bustTimer += dt;
          if (player.bustTimer >= POLICE.bustSeconds) return EVENT_BUSTED;
          break;
        }
      }
    }
    if (state.wanted > 0 && state.policeCars.length === 0 && state.policePeds.length === 0) player.bustTimer = 0;
    return 0;
  }

  function updateBullets(dt) {
    for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
      const b = state.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      let dead = b.life <= 0 || b.x < 0 || b.x > WORLD.width || b.y < 0 || b.y > WORLD.height;
      if (!dead && hitBuilding(city, b.x, b.y, 2)) {
        burst(b.x, b.y, '#ffd76a', 4, 90);
        dead = true;
      }
      if (!dead && b.fromPlayer) {
        for (const ped of [...state.peds, ...state.policePeds]) {
          if (Math.hypot(ped.x - b.x, ped.y - b.y) < PED.radius + 4) {
            ped.health -= b.damage;
            burst(b.x, b.y, '#e5534b', 6, 120);
            dead = true;
            if (ped.health <= 0) {
              if (ped.police) {
                state.policePeds.splice(state.policePeds.indexOf(ped), 1);
                addWanted(WANTED.killPed);
                state.stats.kills += 1;
              } else {
                state.peds.splice(state.peds.indexOf(ped), 1);
                addWanted(WANTED.killPed);
                state.stats.kills += 1;
                state.money += 20;
              }
            }
            break;
          }
        }
      }
      if (!dead && !b.fromPlayer) {
        if (Math.hypot(player.x - b.x, player.y - b.y) < PLAYER.radius + 4) {
          player.health -= b.damage;
          burst(b.x, b.y, '#e5534b', 5, 100);
          dead = true;
          if (player.health <= 0) return EVENT_WASTED;
        }
      }
      if (dead) state.bullets.splice(i, 1);
    }
    return 0;
  }

  function updateCarCollisions(dt, events) {
    // The player's car against traffic, parked cars and police cars.
    const all = [...state.cars, ...state.policeCars];
    for (let i = 0; i < all.length; i += 1) {
      for (let j = i + 1; j < all.length; j += 1) {
        const a = all[i];
        const b = all[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d === 0 || d >= CAR.radius * 2) continue;
        const push = (CAR.radius * 2 - d) / 2;
        const nx = dx / d;
        const ny = dy / d;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        const aPlayer = a === player.inCar;
        const bPlayer = b === player.inCar;
        if ((aPlayer || bPlayer) && Math.abs((aPlayer ? a.speed : b.speed)) > 200) {
          burst((a.x + b.x) / 2, (a.y + b.y) / 2, '#ffb347', 8, 140);
          if (aPlayer) a.speed *= 0.5;
          if (bPlayer) b.speed *= 0.5;
          events |= EVENT_CRASH;
        }
      }
    }
    // The player's car against pedestrians: a hit is a crime.
    if (player.inCar) {
      const car = player.inCar;
      for (let i = state.peds.length - 1; i >= 0; i -= 1) {
        const ped = state.peds[i];
        if (Math.hypot(ped.x - car.x, ped.y - car.y) < CAR.radius + PED.radius) {
          ped.health -= 100;
          burst(ped.x, ped.y, '#e5534b', 8, 150);
          state.peds.splice(i, 1);
          addWanted(WANTED.hitPed);
          state.stats.kills += 1;
        }
      }
    }
    return events;
  }

  function updatePickups() {
    let events = 0;
    for (const p of state.pickups) {
      if (p.taken) continue;
      p.bob += STEP;
      if (Math.hypot(p.x - player.x, p.y - player.y) < 34) {
        p.taken = true;
        if (p.kind === 'cash') {
          state.money += 50;
          state.toast = 'Picked up $50 in loose cash.';
        } else {
          player.health = Math.min(PLAYER.health, player.health + 40);
          state.toast = 'First-aid kit: +40 health.';
        }
        state.toastTimer = 2.5;
        events |= EVENT_PICKUP;
      }
    }
    return events;
  }

  function updateWanted(dt) {
    if (state.wanted === 0) return;
    const nearest = nearestPoliceDistance();
    const hidden = nearest === null || nearest > 700;
    if (hidden) {
      state.wantedTimer += dt;
      if (state.wantedTimer >= WANTED.decaySeconds) {
        state.wanted -= 1;
        state.wantedTimer = 0;
        state.toast = state.wanted === 0 ? 'You lost them. The heat is off.' : 'The heat is cooling off.';
        state.toastTimer = 3;
      }
    } else {
      state.wantedTimer = 0;
    }
  }

  function reset() {
    player.x = city.landmarks.safehouse.x;
    player.y = city.landmarks.safehouse.y + 60;
    player.angle = -Math.PI / 2;
    player.health = PLAYER.health;
    player.ammo = PLAYER.pistolMag;
    player.reload = 0;
    player.fireCooldown = 0;
    player.inCar = null;
    player.bustTimer = 0;
    player.dead = false;
    state.cars.length = 0;
    state.peds.length = 0;
    state.policeCars.length = 0;
    state.policePeds.length = 0;
    state.bullets.length = 0;
    state.particles.length = 0;
    state.wanted = 0;
    state.wantedTimer = 0;
    state.money = 0;
    state.clockHour = CLOCK.startHour;
    state.camera.x = player.x;
    state.camera.y = player.y;
    state.toast = null;
    state.toastTimer = 0;
    state.stats = { kills: 0, carsStolen: 0, missionsDone: 0, faresDone: 0 };
    state.time = 0;
    spawnTraffic();
    spawnParkedCars();
    spawnPeds();
    spawnPickups();
    missions.reset();
  }

  function getSave() {
    return {
      money: state.money,
      missionsDone: missions.doneCount(),
      unlocked: missions.unlocked(),
      clockHour: state.clockHour,
      x: player.x, y: player.y,
      health: player.health,
      stats: state.stats,
    };
  }

  function loadSave(save) {
    state.money = save.money || 0;
    state.clockHour = save.clockHour || CLOCK.startHour;
    player.x = save.x ?? city.landmarks.safehouse.x;
    player.y = save.y ?? city.landmarks.safehouse.y + 60;
    player.health = save.health ?? PLAYER.health;
    if (save.stats) state.stats = { ...state.stats, ...save.stats };
    missions.load(save.missionsDone || 0, save.unlocked || 1);
  }

  /** One fixed step. `gameActions` carries the one-shot presses for this step
   * (ACTION_ENTER / ACTION_RELOAD), read once per frame by the caller: the world
   * never reads the input queue itself, so a press is never eaten by the sim. */
  function step(dt, input, mouseWorld, audio, gameActions) {
    state.time += dt;
    state.clockHour = (state.clockHour + dt * (CLOCK.minutesPerSecond / 60)) % 24;
    if (state.toastTimer > 0) {
      state.toastTimer -= dt;
      if (state.toastTimer <= 0) state.toast = null;
    }
    let events = 0;

    const actions = gameActions || 0;
    if (actions & ACTION_ENTER) events |= enterCar();
    if (actions & ACTION_RELOAD && player.reload <= 0 && player.ammo < PLAYER.pistolMag) player.reload = PLAYER.reloadSeconds;

    if (player.inCar) events |= updatePlayerDriving(dt, input);
    else events |= updatePlayerOnFoot(dt, input, mouseWorld);

    updateTraffic(dt);
    updatePeds(dt);
    events |= updatePolice(dt);
    if (events & EVENT_BUSTED) {
      respawnAfterTrouble('busted');
      return EVENT_BUSTED;
    }
    events |= updateBullets(dt);
    if (events & EVENT_WASTED) {
      respawnAfterTrouble('wasted');
      return EVENT_WASTED;
    }
    events = updateCarCollisions(dt, events);
    events |= updatePickups();
    updateWanted(dt);

    const missionEvents = missions.update(dt);
    events |= missionEvents;
    if (missionEvents & EVENT_JINGLE) {
      state.stats.missionsDone += 1;
    }

    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const p = state.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.life -= dt;
      if (p.life <= 0) state.particles.splice(i, 1);
    }

    // Camera follows the player (or their car), clamped to the city.
    state.camera.x = player.x;
    state.camera.y = player.y;
    if (audio) {
      audio.update(dt, player.inCar ? Math.abs(player.inCar.speed) : 0, nearestPoliceDistance());
    }
    return events;
  }

  reset();
  return {
    state, reset, step, addWanted, missions,
    getSave, loadSave, spawnPoliceCar,
    nearestPoliceDistance,
  };
}
