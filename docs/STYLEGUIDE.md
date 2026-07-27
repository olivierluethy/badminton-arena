# Badminton Arena — Style Guide

**Single source of truth for the visual system.** Colours and text styling are
fixed here. Every screen, HUD element and canvas draw must match these tokens.
Design direction: **Floodlit Arcade** — a saturated night stadium under bright
floodlights, rendered as flat vector shapes with bold arcade energy. Think a
retro sports broadcast crossed with a coin-op cabinet: deep indigo night, a
brilliantly lit blue/green court, two rival kits in warm-vs-cool opposition, and
a stadium LED scoreboard as the signature element.

---

## 1. Design Concept

- **Mood:** electric, competitive, floodlit night match. Confident and loud, but
  disciplined — colour does the shouting, layout stays clean.
- **Signature element:** the **LED scoreboard HUD** — a dark rounded panel with
  glowing tabular digits and animated score pips, echoing a real stadium board.
  Floodlight glow (soft radial vignette from the top corners) frames the court.
- **Rival identity:** every player-facing surface is split into a **warm side
  (Player A / left)** and a **cool side (Player B / right)**. Warm = ember
  orange, cool = aqua teal. This opposition is used consistently in HUD, menus,
  serve indicators and celebration effects.
- **Texture:** flat fills with a single soft glow/shadow per raised element. No
  skeuomorphism, no gradients except the sky and floodlight vignette.

---

## 2. Colour Tokens

All values are canonical hex. CSS custom properties live in
`client/src/styles/tokens.css`; the identical numeric constants live in
`client/src/render/palette.ts` for canvas drawing. **Never hardcode a colour
outside these two files.**

### 2.1 Environment / court

| Token | Hex | Use |
|---|---|---|
| `--sky-top` | `#160E33` | Night sky gradient, top |
| `--sky-bottom` | `#3A1E7A` | Night sky gradient, horizon |
| `--floodlight` | `#FFF4C2` | Floodlight glow (used at low alpha) |
| `--crowd-dark` | `#241748` | Crowd band, far rows |
| `--crowd-light` | `#3D2A6B` | Crowd band, near rows |
| `--crowd-fleck-a` | `#FF5A3C` | Crowd speckle (warm) |
| `--crowd-fleck-b` | `#16D5C7` | Crowd speckle (cool) |
| `--court-in` | `#1E7FD6` | In-court playing surface (blue) |
| `--court-in-alt` | `#2E86DE` | In-court subtle stripe |
| `--court-out` | `#16A34A` | Out-court / apron (green) |
| `--court-out-alt` | `#22C55E` | Out-court stripe |
| `--court-line` | `#F5FAFF` | White line markings |
| `--court-shadow` | `#0C1330` | Under-court / floor shadow base |
| `--net-band` | `#F1F5F9` | Net top tape |
| `--net-mesh` | `#C7D2E0` | Net mesh (drawn at low alpha) |
| `--net-post` | `#0E1B33` | Net posts |

### 2.2 Players / shuttle

| Token | Hex | Use |
|---|---|---|
| `--kit-a` | `#FF5A3C` | Player A primary (ember orange) |
| `--kit-a-dark` | `#C33A20` | Player A shade / limbs |
| `--kit-a-glow` | `#FF8A5C` | Player A highlight / aura |
| `--kit-b` | `#16D5C7` | Player B primary (aqua teal) |
| `--kit-b-dark` | `#0C8E86` | Player B shade / limbs |
| `--kit-b-glow` | `#5CF0E4` | Player B highlight / aura |
| `--skin` | `#F0B48A` | Figure head/hands (neutral) |
| `--racket` | `#E8ECF2` | Racket frame |
| `--racket-grip` | `#1A2338` | Racket grip |
| `--shuttle-feather` | `#FFFFFF` | Shuttle skirt |
| `--shuttle-cork` | `#FFD166` | Shuttle cork nose |
| `--shuttle-trail` | `#FFE14D` | Shuttle motion trail |
| `--shadow-ground` | `#0A1128` | Shuttle/player ground shadow (alpha) |

### 2.3 UI surfaces & accents

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#120A2A` | App background behind canvas / menus |
| `--surface` | `#1C1140` | Panel / card surface |
| `--surface-2` | `#271A56` | Raised panel, inputs |
| `--surface-line` | `#3B2B72` | Panel borders / dividers |
| `--led-panel` | `#0B0820` | Scoreboard / HUD panel (near-black) |
| `--led-off` | `#2A2350` | Unlit LED / empty score pip |
| `--text` | `#F4F1FF` | Primary text |
| `--text-dim` | `#B7ACE0` | Secondary text |
| `--text-muted` | `#7C6FB0` | Tertiary / captions |
| `--accent` | `#FFE14D` | Primary accent (electric yellow) |
| `--accent-2` | `#FF3D9A` | Secondary accent (magenta) |
| `--success` | `#3DDC84` | Ready / connected / win |
| `--warning` | `#FFB020` | Serve countdown / waiting |
| `--danger` | `#FF2D55` | Fault / disconnect / lose |

---

## 3. Typography

Loaded via Google Fonts in `client/index.html`; canvas uses the same families.
If offline, the listed fallbacks preserve character.

| Role | Family | Fallback | Weight | Case | Tracking |
|---|---|---|---|---|---|
| Display / titles | **Archivo** | `system-ui, sans-serif` | 800–900 | UPPERCASE | `-0.01em` |
| HUD labels / eyebrows | **Archivo** | `system-ui` | 700 | UPPERCASE | `0.14em` |
| Body / menus | **Inter** | `system-ui, sans-serif` | 400–600 | Sentence | `0` |
| Data / scores / ping | **Space Mono** | `ui-monospace, monospace` | 700 | tabular | `0.02em` |

**Type scale** (rem, 16px root):

| Step | Size | Line height | Used for |
|---|---|---|---|
| `display-xl` | 4.5rem | 0.95 | Title screen wordmark |
| `display-l` | 3rem | 1.0 | Screen headings, "GAME!" banners |
| `display-m` | 2rem | 1.05 | Section headings |
| `score` | 3.25rem | 1.0 | LED score digits (Space Mono) |
| `heading` | 1.375rem | 1.2 | Card titles, menu items |
| `body` | 1rem | 1.5 | Paragraphs, help text |
| `label` | 0.8125rem | 1.3 | HUD labels, form labels (uppercase, tracked) |
| `caption` | 0.6875rem | 1.3 | Fine print, ping readout |

---

## 4. Spacing, Radius, Shadow, Border

**Spacing scale** (`--space-*`, 4px base): `4, 8, 12, 16, 24, 32, 48, 64, 96`.
Named: `xs=4 sm=8 md=12 lg=16 xl=24 2xl=32 3xl=48 4xl=64 5xl=96`.

**Radius** (`--radius-*`): `sm=6px`, `md=10px`, `lg=16px`, `xl=24px`, `pill=999px`.
Panels use `lg`; buttons use `md`; the LED scoreboard uses `xl`.

**Shadow** (`--shadow-*`):
- `--shadow-panel`: `0 12px 40px -12px rgba(8,4,24,0.7)`
- `--shadow-raised`: `0 6px 18px -6px rgba(8,4,24,0.6)`
- `--shadow-glow-a`: `0 0 24px rgba(255,90,60,0.55)` (warm focus/aura)
- `--shadow-glow-b`: `0 0 24px rgba(22,213,199,0.55)` (cool focus/aura)
- `--shadow-glow-accent`: `0 0 20px rgba(255,225,77,0.5)`

**Borders:** default `1px solid var(--surface-line)`. Focused/active interactive
elements use a `2px` accent-coloured border. The LED panel uses no border, only
its dark fill and inner glow.

---

## 5. Component Patterns

### 5.1 Buttons

- **Primary (`.btn`):** filled `--accent` on `--led-panel` text (`#120A2A`),
  radius `md`, padding `12px 24px`, Archivo 700 uppercase tracked `0.08em`,
  `--shadow-raised`. Hover: brightness +8%, translateY(-1px). Active:
  translateY(1px), shadow collapses. Disabled: `--surface-2` fill, `--text-muted`.
- **Secondary (`.btn--ghost`):** transparent fill, `2px` `--surface-line` border,
  `--text`. Hover: border → `--accent`, subtle `--surface-2` fill.
- **Side-tinted (`.btn--a` / `.btn--b`):** warm/cool variants using kit colours
  for mode/difficulty selection and rematch votes.
- **Focus-visible:** `2px` `--accent` outline, `2px` offset, on every interactive
  element. Never remove focus outlines.

### 5.2 Panels & cards

- Surface `--surface`, radius `lg`, `--shadow-panel`, `1px --surface-line` border,
  padding `--space-2xl`. Card titles `heading` in Archivo, an uppercase tracked
  `label` eyebrow above in `--text-dim`.

### 5.3 LED Scoreboard (HUD signature)

- Panel `--led-panel`, radius `xl`, inner top-glow (`--floodlight` at ~6% alpha).
- Two score groups split left (warm) / right (cool); each shows kit-tinted name
  label, a big `score` digit in Space Mono, and a row of **game pips** (won-game
  markers) — lit pip = kit colour with glow, unlit = `--led-off`.
- Centre column: current game number, serve indicator (a small chevron pointing
  to the serving side in the server's kit colour), and the 5-second serve
  countdown ring when in serve phase (`--warning`).

### 5.4 Banners

- Rally/phase banners ("POINT!", "GAME!", "MATCH!") use `display-l` Archivo 900,
  centred, with a kit-tinted glow behind the winner's colour, scaling/fading in.

### 5.5 Lobby / online elements

- Room code: `display-m` Space Mono, letter-spaced `0.3em`, on a `--surface-2`
  pill with a copy button. Ping readout: `caption` Space Mono, colour-coded
  (`--success` <60ms, `--warning` <120ms, `--danger` otherwise). Connection
  overlays dim the canvas with `rgba(10,6,26,0.72)` and a centred spinner + status.

---

## 6. Interactive States

| State | Treatment |
|---|---|
| Hover | Brightness +8%, subtle lift (translateY -1px) on raised elements |
| Active/pressed | translateY +1px, shadow collapses |
| Focus-visible | `2px --accent` outline, `2px` offset |
| Disabled | `--surface-2` fill, `--text-muted`, no shadow, `cursor: not-allowed` |
| Selected (mode/difficulty) | `2px` kit-tinted border + matching glow shadow |
| Loading | Pulsing `--accent` spinner; text in `--text-dim` |
| Error/fault | `--danger` text/border, brief shake |

---

## 7. Motion

- **Durations:** `fast=120ms`, `base=200ms`, `slow=360ms`. Easing:
  `cubic-bezier(0.22, 1, 0.36, 1)` (arcade "pop") for entrances;
  `ease-out` for hovers.
- **Banners:** scale 0.8→1.0 + fade in over `slow`, hold, fade out.
- **Score pips:** pop in with an overshoot (scale 1.4→1.0) on award.
- **Canvas juice:** shuttle trail (fading segments), impact flash (radial white,
  ~90ms), screen shake (decaying offset, capped 8px), net wobble (damped sine),
  landing dust (pooled particles).
- **`prefers-reduced-motion`:** disable screen shake and non-essential entrance
  animations; keep instantaneous state changes and essential feedback.

---

## 8. Canvas Palette Constants

`client/src/render/palette.ts` re-exports every colour above as string constants
grouped `ENV`, `PLAYER_A`, `PLAYER_B`, `SHUTTLE`, `UI`. Alpha-composited colours
(shadows, glows, floodlight, trail) are applied via `globalAlpha` or `rgba()`
using the base hex. The canvas background is `--bg`; letterbox bars are `#0A0620`.

---

## 9. Light / Dark

The game is **dark-only by design** (night stadium). There is no light theme.
All surfaces assume the dark palette above; do not introduce a light mode.
