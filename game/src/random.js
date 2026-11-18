// A small seeded random number generator (mulberry32): the same seed gives the same city,
// which is what makes the screenshot scenes repeatable.

export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick one item from an array with the seeded random. */
export function pick(random, items) {
  return items[Math.floor(random() * items.length)];
}

/** An integer in [min, max). */
export function intBetween(random, min, max) {
  return min + Math.floor(random() * (max - min));
}
