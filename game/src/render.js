// Drawing only: the world's state and the current screen in, pixels out. The camera
// follows the player at a fixed zoom; the HUD is drawn in a 1280x720 logical space scaled
// to the window. Flat shapes, canvas text, a day/night lighting pass and a live minimap.
// Text that holds a number is rebuilt only when the number changes, so a frame allocates
// nothing in the hot path.

import { CAR, FONT, PALETTE, PED, PLAYER, ROADS, WORLD } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_MISSIONS = 'missions';
export const SCREEN_HELP = 'help';

const HUD_W = 1280;
const HUD_H = 720;
const MINIMAP = { w: 230, h: 178, margin: 16 };

function cachedLabel(prefix) {
  let value = -1;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

/** The title screen's buttons, in HUD logical coordinates, for click handling. */
export const TITLE_BUTTONS = [
  { id: 'new', x: 440, y: 430, w: 400, h: 52, label: 'New Game' },
  { id: 'continue', x: 440, y: 494, w: 400, h: 52, label: 'Continue' },
  { id: 'help', x: 440, y: 558, w: 400, h: 52, label: 'How to Play' },
];

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const moneyLabel = cachedLabel('$');
  const ammoLabel = cachedLabel('');
  const speedLabel = cachedLabel('');
  const timerLabel = cachedLabel('');

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align, baseline) {
    if (!fonts.has(size)) fonts.set(size, `bold ${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = baseline || 'alphabetic';
    context.fillText(value, x, y);
  }

  function plainText(value, x, y, size, color, align, baseline) {
    if (!fonts.has('p' + size)) fonts.set('p' + size, `${size}px ${FONT}`);
    context.font = fonts.get('p' + size);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = baseline || 'alphabetic';
    context.fillText(value, x, y);
  }

  function roundRect(x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }

  function clockText(hour) {
    const h = Math.floor(hour) % 24;
    const m = Math.floor((hour % 1) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  /** 0 = full day, 1 = deep night; and the sunset warmth, 0..1. */
  function lightLevels(hour) {
    let dark = 0;
    let warm = 0;
    if (hour >= 17 && hour < 19.5) {
      const t = (hour - 17) / 2.5;
      dark = t * 0.28;
      warm = Math.sin(t * Math.PI) * 0.9;
    } else if (hour >= 19.5 || hour < 5.5) {
      dark = 0.42;
    } else if (hour >= 5.5 && hour < 8) {
      dark = 0.42 * (1 - (hour - 5.5) / 2.5);
    }
    return { dark, warm };
  }

  function drawGround(state) {
    const city = state.city;
    context.fillStyle = PALETTE.grass;
    context.fillRect(0, 0, WORLD.width, WORLD.height);
    // Harbour water with slow waves.
    context.fillStyle = PALETTE.water;
    context.fillRect(0, ROADS.waterY, WORLD.width, WORLD.height - ROADS.waterY);
    context.fillStyle = PALETTE.waterDeep;
    const wave = (state.time * 24) % 90;
    for (let x = -wave; x < WORLD.width; x += 90) {
      context.fillRect(x, ROADS.waterY + 30 + ((x / 90) % 3) * 40, 46, 5);
    }
    // Parks and the plaza.
    for (const park of city.parks) {
      context.fillStyle = park.kind === 'park' ? PALETTE.park : '#7d7f88';
      context.fillRect(park.x, park.y, park.w, park.h);
    }
    // Sidewalks, then asphalt, then lane dashes.
    context.fillStyle = PALETTE.sidewalk;
    for (const rx of ROADS.vertical) context.fillRect(rx - ROADS.width / 2 - 16, 0, ROADS.width + 32, ROADS.waterY);
    for (const ry of ROADS.horizontal) context.fillRect(0, ry - ROADS.width / 2 - 16, WORLD.width, ROADS.width + 32);
    context.fillStyle = PALETTE.road;
    for (const rx of ROADS.vertical) context.fillRect(rx - ROADS.width / 2, 0, ROADS.width, ROADS.waterY);
    for (const ry of ROADS.horizontal) context.fillRect(0, ry - ROADS.width / 2, WORLD.width, ROADS.width);
    context.fillStyle = PALETTE.lane;
    for (const rx of ROADS.vertical) {
      for (let y = 20; y < ROADS.waterY; y += 56) context.fillRect(rx - 2, y, 4, 28);
    }
    for (const ry of ROADS.horizontal) {
      for (let x = 20; x < WORLD.width; x += 56) context.fillRect(x, ry - 2, 28, 4);
    }
    // Piers into the harbour.
    for (const pier of city.piers) {
      context.fillStyle = '#6b4f2e';
      context.fillRect(pier.x, pier.y, pier.w, pier.h);
      context.fillStyle = '#8a6a3e';
      for (let y = pier.y + 8; y < pier.y + pier.h; y += 22) context.fillRect(pier.x + 4, y, pier.w - 8, 3);
    }
  }

  function drawBuildings(state, view) {
    for (const b of state.city.buildings) {
      if (b.x > view.right || b.x + b.w < view.left || b.y > view.bottom || b.y + b.h < view.top) continue;
      // A soft drop shadow suggests height.
      context.fillStyle = 'rgba(0,0,0,0.35)';
      context.fillRect(b.x + 6 + b.height * 2, b.y + 8 + b.height * 2, b.w, b.h);
      context.fillStyle = b.roof;
      context.fillRect(b.x, b.y, b.w, b.h);
      context.strokeStyle = PALETTE.buildingEdge;
      context.lineWidth = 3;
      context.strokeRect(b.x, b.y, b.w, b.h);
      context.fillStyle = 'rgba(255,255,255,0.10)';
      context.fillRect(b.x + 8, b.y + 8, b.w - 16, 10);
      context.fillStyle = 'rgba(0,0,0,0.25)';
      for (let v = 0; v < b.vents; v += 1) {
        const vx = b.x + 16 + ((v * 47) % Math.max(20, b.w - 40));
        const vy = b.y + 24 + ((v * 31) % Math.max(20, b.h - 50));
        context.fillRect(vx, vy, 14, 10);
      }
      if (b.warehouse) {
        context.fillStyle = '#e8b04b';
        context.font = `bold 22px ${FONT}`;
        context.textAlign = 'center';
        context.fillText('WAREHOUSE', b.x + b.w / 2, b.y + b.h / 2);
      }
    }
    for (const t of state.city.trees) {
      if (t.x < view.left || t.x > view.right || t.y < view.top || t.y > view.bottom) continue;
      context.fillStyle = '#1f4d2a';
      context.beginPath();
      context.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#2f7a3e';
      context.beginPath();
      context.arc(t.x - 3, t.y - 3, t.r * 0.7, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawCarShape(car, isPlayer) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    context.fillStyle = 'rgba(0,0,0,0.4)';
    roundRect(-CAR.length / 2 + 3, -CAR.width / 2 + 3, CAR.length, CAR.width, 8);
    context.fill();
    context.fillStyle = car.colour;
    roundRect(-CAR.length / 2, -CAR.width / 2, CAR.length, CAR.width, 8);
    context.fill();
    // Cabin, windshield and roof.
    context.fillStyle = 'rgba(20,24,32,0.85)';
    roundRect(-6, -CAR.width / 2 + 4, 16, CAR.width - 8, 4);
    context.fill();
    context.fillStyle = 'rgba(255,255,255,0.22)';
    context.fillRect(-2, -CAR.width / 2 + 6, 8, CAR.width - 12);
    // Wheels.
    context.fillStyle = '#0c0d10';
    context.fillRect(-CAR.length / 2 + 6, -CAR.width / 2 - 2, 10, 5);
    context.fillRect(-CAR.length / 2 + 6, CAR.width / 2 - 3, 10, 5);
    context.fillRect(CAR.length / 2 - 16, -CAR.width / 2 - 2, 10, 5);
    context.fillRect(CAR.length / 2 - 16, CAR.width / 2 - 3, 10, 5);
    if (car.police) {
      const flash = Math.floor(performance.now() / 260) % 2 === 0;
      context.fillStyle = flash ? '#ff2d2d' : '#2f6df6';
      context.fillRect(-10, -CAR.width / 2 + 2, 8, 6);
      context.fillStyle = flash ? '#2f6df6' : '#ff2d2d';
      context.fillRect(-10, CAR.width / 2 - 8, 8, 6);
      context.fillStyle = '#e8ecf2';
      context.font = `bold 11px ${FONT}`;
      context.textAlign = 'center';
      context.fillText('POLICE', 2, 4);
    }
    if (isPlayer) {
      context.strokeStyle = '#ff5d8f';
      context.lineWidth = 2.5;
      roundRect(-CAR.length / 2 - 3, -CAR.width / 2 - 3, CAR.length + 6, CAR.width + 6, 10);
      context.stroke();
    }
    context.restore();
  }

  function drawPed(ped) {
    context.fillStyle = ped.colour;
    context.beginPath();
    context.arc(ped.x, ped.y, PED.radius, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = ped.police ? '#1c2f5e' : 'rgba(0,0,0,0.35)';
    context.beginPath();
    context.arc(ped.x + Math.cos(ped.angle) * 4, ped.y + Math.sin(ped.angle) * 4, 5, 0, Math.PI * 2);
    context.fill();
    if (ped.police) {
      context.fillStyle = '#dbe7ff';
      context.font = `bold 8px ${FONT}`;
      context.textAlign = 'center';
      context.fillText('PD', ped.x, ped.y + 3);
    }
  }

  function drawPlayerOnFoot(state) {
    const p = state.player;
    if (p.inCar) return;
    const blink = p.reload > 0 && Math.floor(p.reload * 8) % 2 === 0;
    context.save();
    context.translate(p.x, p.y);
    context.fillStyle = 'rgba(0,0,0,0.4)';
    context.beginPath();
    context.arc(2, 3, PLAYER.radius, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = blink ? '#c9a0b4' : PALETTE.player;
    context.beginPath();
    context.arc(0, 0, PLAYER.radius, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#7a2340';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(0, 0, PLAYER.radius, 0, Math.PI * 2);
    context.stroke();
    // The pistol points where the mouse aims.
    context.rotate(p.angle);
    context.fillStyle = '#1c1e24';
    context.fillRect(PLAYER.radius - 2, -2.5, 16, 5);
    context.restore();
  }

  function drawMarker(state, view) {
    const marker = state.marker;
    if (!marker) return;
    const pulse = 1 + Math.sin(state.time * 4) * 0.15;
    context.strokeStyle = PALETTE.marker;
    context.lineWidth = 3;
    context.beginPath();
    context.arc(marker.x, marker.y, 26 * pulse, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = PALETTE.marker;
    context.beginPath();
    context.arc(marker.x, marker.y, 6, 0, Math.PI * 2);
    context.fill();
    // A beacon column so the target reads from far away.
    const grad = context.createLinearGradient(marker.x, marker.y - 260, marker.x, marker.y);
    grad.addColorStop(0, 'rgba(242,201,76,0)');
    grad.addColorStop(1, 'rgba(242,201,76,0.35)');
    context.fillStyle = grad;
    context.fillRect(marker.x - 5, marker.y - 260, 10, 260);
    text(marker.label, marker.x, marker.y - 40, 17, PALETTE.marker, 'center');
  }

  function drawHud(state, ui) {
    const scale = Math.min(canvas.width / HUD_W, canvas.height / HUD_H);
    const ox = (canvas.width - HUD_W * scale) / 2;
    const oy = (canvas.height - HUD_H * scale) / 2;
    context.save();
    context.setTransform(scale, 0, 0, scale, ox, oy);
    const p = state.player;

    // Top-left: health and money.
    context.fillStyle = PALETTE.hudPanel;
    roundRect(16, 14, 250, 64, 10);
    context.fill();
    plainText('MARA VOSS', 30, 32, 15, PALETTE.hudMuted, 'left', 'top');
    context.fillStyle = '#20242e';
    roundRect(30, 46, 160, 14, 7);
    context.fill();
    context.fillStyle = p.health > 30 ? PALETTE.hudGreen : PALETTE.hudRed;
    roundRect(30, 46, Math.max(0, 160 * (p.health / PLAYER.health)), 14, 7);
    context.fill();
    text(String(Math.ceil(p.health)), 198, 46, 15, PALETTE.hudText, 'left', 'top');
    text(moneyLabel(state.money), 30, 66, 18, PALETTE.hudGold, 'left', 'top');

    // Top-right: wanted stars and the clock.
    context.fillStyle = PALETTE.hudPanel;
    roundRect(HUD_W - 266, 14, 250, 64, 10);
    context.fill();
    const flash = state.wanted >= 3 && Math.floor(state.time * 2) % 2 === 0;
    for (let s = 0; s < 5; s += 1) {
      text('★', HUD_W - 246 + s * 30, 56, 30, s < state.wanted ? (flash ? '#ff8a80' : '#ffd54a') : '#3a3f4a', 'left', 'top');
    }
    text(clockText(state.clockHour), HUD_W - 30, 32, 17, PALETTE.hudText, 'right', 'top');

    // Top-centre: the objective.
    if (state.objective) {
      context.fillStyle = PALETTE.hudPanel;
      const w = Math.min(640, 30 + state.objective.length * 8.4);
      roundRect((HUD_W - w) / 2, 14, w, 40, 10);
      context.fill();
      plainText('◆ ' + state.objective, HUD_W / 2, 40, 17, PALETTE.hudText, 'center', 'middle');
    }

    // Bottom-left: what the player is doing, and the controls that matter now.
    const active = state.missions.activeMission();
    let status = p.inCar ? `Driving — ${speedLabel(Math.round(Math.abs(p.inCar.speed) * 0.22))} mph` : `On foot — ${ammoLabel(p.ammo)} / ${PLAYER.pistolMag} rounds`;
    if (active && active.timer > 0) status += `   ⏱ ${timerLabel(Math.ceil(active.timer))}s`;
    plainText(status, 20, HUD_H - 52, 17, PALETTE.hudText, 'left', 'top');
    plainText(p.inCar ? 'W/S drive · A/D steer · Space handbrake · E get out' : 'WASD move · Mouse aim · Click shoot · E enter car · R reload', 20, HUD_H - 28, 14, PALETTE.hudMuted, 'left', 'top');

    // Toast, centre-bottom. Long lines are cut with an ellipsis so they never run off.
    if (state.toast) {
      const toastText = state.toast.length > 92 ? state.toast.slice(0, 89) + '…' : state.toast;
      context.fillStyle = PALETTE.hudPanel;
      const w = Math.min(760, 30 + toastText.length * 7.6);
      roundRect((HUD_W - w) / 2, HUD_H - 108, w, 38, 10);
      context.fill();
      plainText(toastText, HUD_W / 2, HUD_H - 89, 16, PALETTE.hudText, 'center', 'middle');
    }

    drawMinimap(state, ui);
    context.restore();
  }

  function drawMinimap(state, ui) {
    const x = HUD_W - MINIMAP.w - MINIMAP.margin;
    const y = HUD_H - MINIMAP.h - MINIMAP.margin;
    const sx = MINIMAP.w / WORLD.width;
    const sy = MINIMAP.h / WORLD.height;
    context.fillStyle = 'rgba(8,10,16,0.82)';
    roundRect(x - 6, y - 6, MINIMAP.w + 12, MINIMAP.h + 12, 10);
    context.fill();
    context.save();
    context.beginPath();
    roundRect(x, y, MINIMAP.w, MINIMAP.h, 6);
    context.clip();
    context.fillStyle = '#1d3a2a';
    context.fillRect(x, y, MINIMAP.w, MINIMAP.h);
    context.fillStyle = PALETTE.water;
    context.fillRect(x, y + ROADS.waterY * sy, MINIMAP.w, MINIMAP.h - ROADS.waterY * sy);
    context.fillStyle = '#2a4a35';
    for (const park of state.city.parks) context.fillRect(x + park.x * sx, y + park.y * sy, park.w * sx, park.h * sy);
    context.strokeStyle = '#565b66';
    context.lineWidth = 2.4;
    for (const rx of ROADS.vertical) {
      context.beginPath();
      context.moveTo(x + rx * sx, y);
      context.lineTo(x + rx * sx, y + ROADS.waterY * sy);
      context.stroke();
    }
    for (const ry of ROADS.horizontal) {
      context.beginPath();
      context.moveTo(x, y + ry * sy);
      context.lineTo(x + MINIMAP.w, y + ry * sy);
      context.stroke();
    }
    // Cars as white dots, police flashing red/blue, the marker pulsing yellow.
    context.fillStyle = '#e8ecf2';
    for (const car of state.cars) {
      if (car.parked) continue;
      context.fillRect(x + car.x * sx - 1.5, y + car.y * sy - 1.5, 3, 3);
    }
    const flash = Math.floor(state.time * 3) % 2 === 0;
    context.fillStyle = flash ? '#ff2d2d' : '#2f6df6';
    for (const car of state.policeCars) context.fillRect(x + car.x * sx - 2, y + car.y * sy - 2, 4, 4);
    if (state.marker) {
      const pulse = 3 + Math.sin(state.time * 5) * 1.5;
      context.fillStyle = PALETTE.marker;
      context.beginPath();
      context.arc(x + state.marker.x * sx, y + state.marker.y * sy, pulse, 0, Math.PI * 2);
      context.fill();
    }
    // The player: a pink arrow that turns with them.
    const p = state.player;
    context.save();
    context.translate(x + p.x * sx, y + p.y * sy);
    context.rotate(p.angle);
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.moveTo(8, 0);
    context.lineTo(-5, -5);
    context.lineTo(-5, 5);
    context.closePath();
    context.fill();
    context.restore();
    context.restore();
    plainText('PORT AZURE', x + 4, y + MINIMAP.h - 6, 11, PALETTE.hudMuted, 'left', 'bottom');
  }

  function drawPanel(title, lines, prompt, accent) {
    const height = 150 + lines.length * 32 + 64;
    const w = 640;
    const x = (HUD_W - w) / 2;
    const y = (HUD_H - height) / 2;
    context.fillStyle = 'rgba(8,10,16,0.88)';
    roundRect(x, y, w, height, 16);
    context.fill();
    context.strokeStyle = accent || PALETTE.hudGold;
    context.lineWidth = 2;
    roundRect(x, y, w, height, 16);
    context.stroke();
    text(title, HUD_W / 2, y + 64, 46, PALETTE.hudText, 'center');
    lines.forEach((line, i) => {
      plainText(line, HUD_W / 2, y + 118 + i * 32, 19, PALETTE.hudMuted, 'center');
    });
    if (prompt) text(prompt, HUD_W / 2, y + height - 34, 22, accent || PALETTE.hudGold, 'center');
  }

  function drawTitle(state, ui) {
    const scale = Math.min(canvas.width / HUD_W, canvas.height / HUD_H);
    const ox = (canvas.width - HUD_W * scale) / 2;
    const oy = (canvas.height - HUD_H * scale) / 2;
    context.save();
    context.setTransform(scale, 0, 0, scale, ox, oy);
    context.fillStyle = 'rgba(6,8,14,0.55)';
    context.fillRect(0, 0, HUD_W, HUD_H);
    text('NEON HARBOR', HUD_W / 2, 130, 84, '#ffd54a', 'center');
    plainText('An open-world crime story in Port Azure', HUD_W / 2, 168, 22, PALETTE.hudText, 'center');
    plainText('Mara Voss owes the harbour syndicate $50,000. Eddie Kline has three jobs that pay it down.', HUD_W / 2, 210, 17, PALETTE.hudMuted, 'center');
    plainText('Drive. Steal. Run. Do not get caught.', HUD_W / 2, 238, 17, PALETTE.hudMuted, 'center');
    if (ui.best > 0) plainText(`Best bankroll so far: $${ui.best}`, HUD_W / 2, 286, 17, PALETTE.hudGold, 'center');
    for (const button of TITLE_BUTTONS) {
      const isContinue = button.id === 'continue';
      const disabled = isContinue && !ui.hasSave;
      context.fillStyle = disabled ? '#2a2e38' : (button.id === 'new' ? '#c2185b' : '#232833');
      roundRect(button.x, button.y, button.w, button.h, 10);
      context.fill();
      context.strokeStyle = button.id === 'new' ? '#ff5d8f' : '#4a5060';
      context.lineWidth = 2;
      roundRect(button.x, button.y, button.w, button.h, 10);
      context.stroke();
      text(button.label, button.x + button.w / 2, button.y + 35, 24, disabled ? '#6b7280' : PALETTE.hudText, 'center');
    }
    plainText('WASD move / drive · Mouse aim · Click shoot · E enter a car · M missions · P pause · L sound', HUD_W / 2, 648, 15, PALETTE.hudMuted, 'center');
    plainText('Best played in desktop Chrome. Progress saves automatically.', HUD_W / 2, 676, 14, PALETTE.hudMuted, 'center');
    context.restore();
  }

  function drawMissions(state, ui) {
    const scale = Math.min(canvas.width / HUD_W, canvas.height / HUD_H);
    const ox = (canvas.width - HUD_W * scale) / 2;
    const oy = (canvas.height - HUD_H * scale) / 2;
    context.save();
    context.setTransform(scale, 0, 0, scale, ox, oy);
    context.fillStyle = 'rgba(6,8,14,0.72)';
    context.fillRect(0, 0, HUD_W, HUD_H);
    const list = state.missions.list();
    const height = 170 + list.length * 108;
    const w = 760;
    const x = (HUD_W - w) / 2;
    const y = (HUD_H - height) / 2;
    context.fillStyle = 'rgba(8,10,16,0.92)';
    roundRect(x, y, w, height, 16);
    context.fill();
    text("EDDIE'S JOBS", HUD_W / 2, y + 58, 36, PALETTE.hudText, 'center');
    list.forEach((m, i) => {
      const my = y + 96 + i * 108;
      context.fillStyle = '#181c26';
      roundRect(x + 24, my, w - 48, 92, 10);
      context.fill();
      const status = m.status === 'done' ? '✓ DONE' : m.status === 'available' ? 'AVAILABLE' : 'LOCKED';
      const colour = m.status === 'done' ? PALETTE.hudGreen : m.status === 'available' ? PALETTE.hudGold : PALETTE.hudMuted;
      text(`${i + 1}. ${m.name}`, x + 44, my + 32, 22, PALETTE.hudText, 'left');
      plainText(m.brief, x + 44, my + 62, 14, PALETTE.hudMuted, 'left');
      text(`${status} · $${m.reward}`, x + w - 44, my + 32, 18, colour, 'right');
    });
    plainText('Press Enter to start the next available job · M or Esc to close', HUD_W / 2, y + height - 26, 16, PALETTE.hudGold, 'center');
    context.restore();
  }

  function drawHelp() {
    const scale = Math.min(canvas.width / HUD_W, canvas.height / HUD_H);
    const ox = (canvas.width - HUD_W * scale) / 2;
    const oy = (canvas.height - HUD_H * scale) / 2;
    context.save();
    context.setTransform(scale, 0, 0, scale, ox, oy);
    context.fillStyle = 'rgba(6,8,14,0.85)';
    context.fillRect(0, 0, HUD_W, HUD_H);
    const rows = [
      ['W A S D / Arrows', 'Move on foot · drive, steer and brake in a car'],
      ['Mouse + Click', 'Aim and fire the pistol (on foot)'],
      ['E', 'Steal / enter the nearest car · get out again'],
      ['Space', 'Handbrake while driving'],
      ['Shift', 'Sprint on foot'],
      ['R', 'Reload the pistol'],
      ['M', "Eddie's jobs — missions and fares"],
      ['P / Esc', 'Pause'],
      ['L', 'Sound on / off'],
    ];
    const height = 150 + rows.length * 36 + 70;
    const w = 720;
    const x = (HUD_W - w) / 2;
    const y = (HUD_H - height) / 2;
    context.fillStyle = 'rgba(8,10,16,0.92)';
    roundRect(x, y, w, height, 16);
    context.fill();
    text('HOW TO PLAY', HUD_W / 2, y + 60, 38, PALETTE.hudText, 'center');
    rows.forEach((row, i) => {
      plainText(row[0], x + 48, y + 112 + i * 36, 18, PALETTE.hudGold, 'left');
      plainText(row[1], x + 300, y + 112 + i * 36, 17, PALETTE.hudText, 'left');
    });
    text('Click anywhere or press Enter to go back', HUD_W / 2, y + height - 30, 20, PALETTE.hudGold, 'center');
    context.restore();
  }

  /** Paint one frame: the world through the camera, then the HUD or a panel. */
  function draw(state, screen, ui) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const cam = state.camera;
    const worldScale = canvas.width / 1150;
    const view = {
      left: cam.x - canvas.width / 2 / worldScale - 60,
      right: cam.x + canvas.width / 2 / worldScale + 60,
      top: cam.y - canvas.height / 2 / worldScale - 60,
      bottom: cam.y + canvas.height / 2 / worldScale + 60,
    };
    context.setTransform(worldScale, 0, 0, worldScale, canvas.width / 2 - cam.x * worldScale, canvas.height / 2 - cam.y * worldScale);
    drawGround(state);
    drawBuildings(state, view);
    // Pickups.
    for (const p of state.pickups) {
      if (p.taken) continue;
      const bob = Math.sin(p.bob * 3) * 3;
      context.fillStyle = p.kind === 'cash' ? PALETTE.hudGold : '#ffffff';
      context.beginPath();
      context.arc(p.x, p.y + bob, 13, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = p.kind === 'cash' ? '#7a5b00' : '#c0392b';
      context.font = `bold 15px ${FONT}`;
      context.textAlign = 'center';
      context.fillText(p.kind === 'cash' ? '$' : '+', p.x, p.y + bob + 5);
    }
    drawMarker(state, view);
    for (const car of state.cars) {
      if (car.x < view.left || car.x > view.right || car.y < view.top || car.y > view.bottom) continue;
      drawCarShape(car, car === state.player.inCar);
    }
    for (const car of state.policeCars) drawCarShape(car, false);
    for (const ped of state.peds) {
      if (ped.x < view.left || ped.x > view.right || ped.y < view.top || ped.y > view.bottom) continue;
      drawPed(ped);
    }
    for (const ped of state.policePeds) drawPed(ped);
    drawPlayerOnFoot(state);
    // Bullets as tracers.
    context.strokeStyle = '#ffe08a';
    context.lineWidth = 3;
    for (const b of state.bullets) {
      context.beginPath();
      context.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
      context.lineTo(b.x, b.y);
      context.stroke();
    }
    // Particles.
    for (const p of state.particles) {
      context.globalAlpha = Math.max(0, p.life / p.maxLife);
      context.fillStyle = p.colour;
      context.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    context.globalAlpha = 1;

    // Lighting and headlights, in screen space.
    context.setTransform(1, 0, 0, 1, 0, 0);
    const { dark } = lightLevels(state.clockHour);
    if (dark > 0.02) {
      context.fillStyle = `rgba(8, 14, 38, ${dark})`;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.save();
      context.globalCompositeOperation = 'destination-out';
      for (const car of [...state.cars, ...state.policeCars]) {
        if (car.parked) continue;
        const sx = (car.x - cam.x) * worldScale + canvas.width / 2;
        const sy = (car.y - cam.y) * worldScale + canvas.height / 2;
        const hx = sx + Math.cos(car.angle) * (CAR.length / 2) * worldScale;
        const hy = sy + Math.sin(car.angle) * (CAR.length / 2) * worldScale;
        context.beginPath();
        context.moveTo(hx, hy);
        context.arc(hx, hy, 150 * worldScale, car.angle - 0.4, car.angle + 0.4);
        context.closePath();
        context.fillStyle = `rgba(0,0,0,${dark * 0.55})`;
        context.fill();
      }
      context.restore();
    }
    const { warm } = lightLevels(state.clockHour);
    if (warm > 0.03) {
      context.fillStyle = `rgba(255, 110, 40, ${warm * 0.10})`;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (screen === SCREEN_TITLE) {
      drawTitle(state, ui);
      return;
    }
    if (screen === SCREEN_HELP) {
      drawHelp();
      return;
    }
    drawHud(state, ui);
    if (screen === SCREEN_MISSIONS) drawMissions(state, ui);
    else if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The city waits for no one — except right now.', ui.muted ? 'Sound: off (L to turn on)' : 'Sound: on (L to mute)'], 'Press P to keep playing');
    } else if (screen === SCREEN_OVER) {
      drawPanel(ui.overTitle || 'Busted', ui.overLines || [''], 'Press Space or click to get back out there', PALETTE.hudRed);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, lightLevels };
}
