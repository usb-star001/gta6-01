# Neon Harbor — an open-world crime story in Port Azure

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/usb-star001/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/usb-star001/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Neon Harbor** is a top-down open-world crime game set in the fictional city of
Port Azure. Mara Voss owes the harbour syndicate $50,000, and Eddie Kline has three
jobs that pay it down — if she can stay ahead of the harbour police.

## What is in the game

- **A city to explore on foot and by car** — a road grid with traffic, pedestrians,
  parked cars, a park, a plaza, warehouses and the harbour with its piers and
  lighthouse. The camera follows you; the city is bigger than the screen.
- **Cars to steal and drive** — walk up to any car and press E. Jacking a car with a
  driver in it is a crime; the driver legs it and somebody calls it in. Driving has
  acceleration, steering, braking, a handbrake and collisions.
- **A wanted level with police who respond** — 0 to 5 stars. Crimes raise it, laying
  low cools it off. Police cruisers chase and ram you; at 2+ stars officers on foot
  chase and shoot. Get caught and you wake up at St. Anselm Hospital, lighter.
- **Missions and a story** — three jobs from Eddie: *First Fare* (a pickup and a
  delivery), *The Getaway* (lose a 3-star heat), and *Harbor Run* (a timed delivery
  with the police on you). After the first job, repeatable fares pay the bills.
- **Combat** — a pistol on foot: aim with the mouse, click to fire, R to reload.
- **HUD with a live minimap** — health, money, wanted stars, the clock, the current
  objective, a mission timer, and a minimap showing roads, cars, police and the
  mission marker.
- **A start menu and a save** — New Game / Continue / How to Play, and progress
  (money, jobs done, position, time of day) autosaves to localStorage.
- **Polish** — a day cycle from dusk gold to night with headlights, and all sound
  and music synthesised live with WebAudio (engine hum, sirens, gunshots, a bassline
  and hats). No external files: the game runs from static files with no network
  requests.

## How to play

| Control | Action |
|---|---|
| WASD / Arrows | Move on foot · drive, steer and brake in a car |
| Mouse + Click | Aim and fire the pistol (on foot) |
| E | Steal / enter the nearest car · get out again |
| Space | Handbrake while driving |
| Shift | Sprint on foot |
| R | Reload the pistol |
| M | Eddie's jobs — missions and fares |
| P / Esc | Pause |
| L | Sound on / off |

## Run it

Serve `game/` with any static server and open `game/index.html` in desktop Chrome,
or run `node serve.ts` and open http://localhost:8080. No build step, no network.

Everything in the game is original: the city, the characters, the vehicles, the
story, the art and the music were made for this entry. Nothing comes from any
commercial game.
