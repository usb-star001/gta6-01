// The city of Port Azure, generated once from the seed: a road grid, blocks full
// of buildings, a park, a plaza, the harbour and its piers, and the named places
// the story and the missions use. Everything here is plain data — no drawing,
// no browser.

import { ROADS, WORLD } from './config.js';
import { intBetween, pick } from './random.js';

const ROOF_COLOURS = ['#4a4f5c', '#5c5148', '#46586b', '#5b4a5e', '#3f5a4a', '#6b5a46', '#54423a'];
const PARK_TREES = 14;

/** Is (x, y) on a road (on the asphalt, not the sidewalk)? */
export function onRoad(x, y) {
  const half = ROADS.width / 2;
  for (const rx of ROADS.vertical) if (Math.abs(x - rx) <= half) return true;
  for (const ry of ROADS.horizontal) if (Math.abs(y - ry) <= half) return true;
  return false;
}

/** Is (x, y) on a sidewalk (the ring just outside the asphalt)? */
export function onSidewalk(x, y) {
  const half = ROADS.width / 2 + 16;
  for (const rx of ROADS.vertical) if (Math.abs(x - rx) <= half) return true;
  for (const ry of ROADS.horizontal) if (Math.abs(y - ry) <= half) return true;
  return false;
}

/** The nearest road centre line to a point, for snapping traffic and parked cars. */
export function nearestRoad(x, y) {
  let best = null;
  for (const rx of ROADS.vertical) {
    const d = Math.abs(x - rx);
    if (best === null || d < best.d) best = { axis: 'v', at: rx, d };
  }
  for (const ry of ROADS.horizontal) {
    const d = Math.abs(y - ry);
    if (best === null || d < best.d) best = { axis: 'h', at: ry, d };
  }
  return best;
}

/** Does the circle at (x, y) with radius r hit a building? Returns the building or null. */
export function hitBuilding(city, x, y, r) {
  for (const b of city.buildings) {
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return b;
  }
  return null;
}

/** Is the point in the water (not on a pier)? */
export function inWater(city, x, y) {
  if (y < ROADS.waterY) return false;
  for (const p of city.piers) {
    if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) return false;
  }
  return true;
}

export function createCity(random) {
  const buildings = [];
  const parks = [];
  const trees = [];
  const parkedSpots = [];
  const half = ROADS.width / 2;

  // One block per gap between neighbouring roads, plus the strip above the harbour.
  const xs = ROADS.vertical;
  const ys = ROADS.horizontal;
  for (let bx = 0; bx < xs.length - 1; bx += 1) {
    for (let by = 0; by < ys.length - 1; by += 1) {
      const x0 = xs[bx] + half + 14;
      const y0 = ys[by] + half + 14;
      const x1 = xs[bx + 1] - half - 14;
      const y1 = ys[by + 1] - half - 14;
      const bw = x1 - x0;
      const bh = y1 - y0;
      // The central block is the park; the block north-east of it is the plaza.
      if (bx === 3 && by === 2) {
        parks.push({ x: x0, y: y0, w: bw, h: bh, kind: 'park' });
        for (let t = 0; t < PARK_TREES; t += 1) {
          trees.push({ x: x0 + 20 + random() * (bw - 40), y: y0 + 20 + random() * (bh - 40), r: 12 + random() * 8 });
        }
        continue;
      }
      if (bx === 4 && by === 1) {
        parks.push({ x: x0, y: y0, w: bw, h: bh, kind: 'plaza' });
        continue;
      }
      // One or two buildings per block, with a margin for the sidewalk around them.
      const lots = random() < 0.45 ? 2 : 1;
      for (let lot = 0; lot < lots; lot += 1) {
        const w = lots === 1 ? bw * (0.55 + random() * 0.3) : bw * 0.42;
        const h = lots === 1 ? bh * (0.55 + random() * 0.3) : bh * (0.8 + random() * 0.15);
        const x = lots === 1 ? x0 + (bw - w) / 2 : x0 + lot * (bw / 2) + (bw / 2 - w) / 2;
        const y = y0 + (bh - h) / 2;
        buildings.push({
          x, y, w, h,
          roof: pick(random, ROOF_COLOURS),
          height: intBetween(random, 1, 4),
          vents: intBetween(random, 1, 4),
        });
      }
    }
  }

  // The dock strip between the last road and the water: warehouses.
  const dockY0 = ys[ys.length - 1] + half + 14;
  const dockY1 = ROADS.waterY - 16;
  for (let i = 0; i < 4; i += 1) {
    const w = 260 + random() * 120;
    const x = 200 + i * 820 + random() * 80;
    buildings.push({ x, y: dockY0 + 10, w, h: dockY1 - dockY0 - 20, roof: '#5c5148', height: 1, vents: 2, warehouse: true });
  }

  // Piers reaching into the harbour; the east pier ends at the lighthouse.
  const piers = [
    { x: 700, y: ROADS.waterY - 10, w: 46, h: 200, name: 'West Pier' },
    { x: 1980, y: ROADS.waterY - 10, w: 46, h: 260, name: 'Lighthouse Pier' },
    { x: 3000, y: ROADS.waterY - 10, w: 46, h: 170, name: 'East Pier' },
  ];

  // Named places the story, the HUD and the missions point at.
  const landmarks = {
    safehouse: { x: 660, y: 660, label: 'Safehouse' },
    hotel: { x: 1100, y: 1100, label: 'Harbor Hotel' },
    docks: { x: 900, y: 2500, label: 'The Docks' },
    warehouse: { x: 1500, y: 2500, label: 'Warehouse 7' },
    lighthouse: { x: 2003, y: 2770, label: 'Lighthouse Point' },
    vault: { x: 1980, y: 1540, label: 'The Vault' },
    hospital: { x: 2420, y: 660, label: 'St. Anselm Hospital' },
    tower: { x: 1540, y: 660, label: 'Solano Tower' },
    park: { x: 1760, y: 1320, label: 'Marina Park' },
  };

  // Parked cars sit along the kerb of random roads.
  for (let i = 0; i < 26; i += 1) {
    const vertical = random() < 0.5;
    if (vertical) {
      const rx = pick(random, xs);
      const y = 140 + random() * (ROADS.waterY - 280);
      parkedSpots.push({ x: rx + (random() < 0.5 ? -1 : 1) * (half - 16), y, angle: Math.PI / 2, vertical: true });
    } else {
      const ry = pick(random, ys);
      const x = 140 + random() * (WORLD.width - 280);
      parkedSpots.push({ x, y: ry + (random() < 0.5 ? -1 : 1) * (half - 16), angle: 0, vertical: false });
    }
  }

  return { buildings, parks, trees, piers, landmarks, parkedSpots };
}
