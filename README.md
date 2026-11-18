# Neon Harbor — an open-world crime game in Port Azure

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/usb-star001/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/usb-star001/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Neon Harbor** is a top-down open-world crime game set in the fictional city of
Port Azure. Mara Voss owes the harbour syndicate **$50,000**, and the only way out
is through Eddie Kline's jobs — while the harbour police close in. An intro story
card lays out the debt before you take the wheel.

## The game

- **A living city** — a 3600×2800 road grid with traffic, pedestrians, parked cars,
  a park, a plaza, warehouses and the harbour with its piers and lighthouse. The
  camera follows you; the city is much bigger than the screen.
- **Steal and drive** — walk up to any car and press E. Taking one with a driver
  inside is a crime: the driver runs and somebody calls it in. Driving has
  acceleration, steering, braking, a handbrake and collisions. The player car is
  drawn big on purpose (64×30) so it reads clearly at a glance — in a chase, on
  the minimap, and in a screenshot.
- **A wanted level that fights back** — 0 to 5 stars. Crimes raise it, laying low
  cools it off. Police cruisers chase and ram you; at 2+ stars officers on foot
  chase and shoot. Get caught and you wake up at St. Anselm Hospital, lighter.
- **Six story jobs, two contacts** — *First Fare* ($150, a pickup and a
  delivery), *The Getaway* ($300, lose a 3-star heat), and *Harbor Run* ($500, a
  timed delivery with the police on you) from Eddie Kline; then Rosa the Broker's
  *The Smuggler* ($400, a hot crate from the Docks), *The Tail* ($350, follow an
  informant without being spotted) and *The Payoff* ($600, the syndicate's money
  to the Lighthouse). After the first job, repeatable fares keep the money coming.
- **Rosa's delivery gigs** — repeatable parcel runs between the landmarks, paid
  on delivery, that appear whenever the map marker is free. Rosa hangs around
  the Tower; look for the purple R.
- **Street races** — three time trials with checkered flags: the *Harbor Sprint*,
  the *Uptown Loop*, and the *Night Run*, which only opens after dark. Beat the
  par time for the payout, beat your best and it is remembered.
- **Hidden packages** — twelve parcels stashed around the city, near the
  landmarks and halfway along the runs between them. Each pays $25; find all
  twelve and the syndicate's stash pays $300 on top. They glow brighter at
  night, when a careful driver does the collecting.
- **Two special rides** — the *Night Hawk* motorcycle by the Safehouse, fast and
  loud, and the *Harbor Hauler* truck at the Docks, slow and heavy but paying by
  the minute, double after dark. Walk up and press E to take one, E again to
  leave it.
- **A day and night cycle** — one day runs five minutes of game time, opening at
  dusk gold and sliding through night into dawn and day. The light changes what
  you can do: the Night Run only runs after dark, packages glow, and hauling
  pays double.
- **Combat** — a pistol on foot: aim with the mouse, click to fire, R to reload.
- **HUD and live minimap** — health, money, wanted stars, the clock, the current
  objective, a mission timer, and a minimap showing roads, cars, police and the
  mission marker.
- **Start menu and save** — New Game / Continue / How to Play, and progress
  (money, jobs done, position, time of day) autosaves to localStorage.
- **Sound and music, all synthesised** — WebAudio only, no audio files: engine hum,
  sirens, gunshots, and two music loops sharing one step sequencer. "Dusk" is a
  slow minor bassline for cruising; "Night Run" is a busier loop with a plucked
  lead. They trade every four bars, and three stars or more force the tense loop
  at once. A day cycle runs from dusk gold to night, with headlights after dark.

## Controls

| Control | Action |
|---|---|
| WASD / Arrows | Move on foot · drive, steer and brake in a car |
| Mouse + Click | Aim and fire the pistol (on foot) |
| E | Steal / enter the nearest car · get out again · join a race · take a special ride |
| Space | Handbrake while driving |
| Shift | Sprint on foot |
| R | Reload the pistol |
| M | Eddie's and Rosa's jobs — missions, fares and gigs |
| P / Esc | Pause |
| L | Sound on / off |

## Run it

Serve `game/` with any static server and open `game/index.html` in desktop Chrome,
or run `node serve.ts` and open http://localhost:8080. No build step, no network,
no libraries — plain canvas and ES modules.

Everything in the game is original: the city, the characters, the vehicles, the
story, the art and the music were made for this entry. Nothing comes from any
commercial game.
