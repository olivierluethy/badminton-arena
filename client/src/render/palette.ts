// Canvas colour constants — the numeric mirror of docs/STYLEGUIDE.md §2.
// Every canvas draw pulls colours from here (never hardcoded elsewhere).

export const ENV = {
  skyTop: '#160E33',
  skyBottom: '#3A1E7A',
  floodlight: '#FFF4C2',
  crowdDark: '#241748',
  crowdLight: '#3D2A6B',
  crowdFleckA: '#FF5A3C',
  crowdFleckB: '#16D5C7',
  courtIn: '#1E7FD6',
  courtInAlt: '#2E86DE',
  courtOut: '#16A34A',
  courtOutAlt: '#22C55E',
  courtLine: '#F5FAFF',
  courtShadow: '#0C1330',
  netBand: '#F1F5F9',
  netMesh: '#C7D2E0',
  netPost: '#0E1B33',
  letterbox: '#0A0620',
  bg: '#120A2A',
} as const;

export const PLAYER_A = {
  kit: '#FF5A3C',
  dark: '#C33A20',
  glow: '#FF8A5C',
} as const;

export const PLAYER_B = {
  kit: '#16D5C7',
  dark: '#0C8E86',
  glow: '#5CF0E4',
} as const;

export const FIGURE = {
  skin: '#F0B48A',
  racket: '#E8ECF2',
  racketGrip: '#1A2338',
} as const;

export const SHUTTLE = {
  feather: '#FFFFFF',
  cork: '#FFD166',
  trail: '#FFE14D',
} as const;

export const UI = {
  shadowGround: '#0A1128',
  accent: '#FFE14D',
  accent2: '#FF3D9A',
  success: '#3DDC84',
  warning: '#FFB020',
  danger: '#FF2D55',
  ledPanel: '#0B0820',
  ledOff: '#2A2350',
  text: '#F4F1FF',
  textDim: '#B7ACE0',
} as const;

export interface Kit {
  kit: string;
  dark: string;
  glow: string;
}

/** Kit palette for a player id (0 = warm A, 1 = cool B). */
export function kitFor(id: number): Kit {
  return id === 0 ? PLAYER_A : PLAYER_B;
}

/** Build an rgba() string from a #rrggbb hex and an alpha in [0,1]. */
export function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}
