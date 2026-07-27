// World constants and coordinate space for the badminton simulation.
//
// Coordinate space is virtual and resolution-independent: 1200 x 675 (16:9).
// Origin is top-left, +x points right, +y points DOWN. Gravity is therefore a
// positive y acceleration, and "up" velocities are negative.
//
// All gameplay values live here so the physics, rules and bot read from a single
// tunable source. Feel-tuning happens in Stage 8; these are sensible starts.

import { DEG } from './math.js';

// ---------------------------------------------------------------------------
// Simulation timing
// ---------------------------------------------------------------------------
export const TICK_RATE = 60; // Hz — fixed simulation step
export const DT = 1 / TICK_RATE; // seconds per tick
export const SNAPSHOT_RATE = 30; // Hz — server → client broadcast rate

// ---------------------------------------------------------------------------
// Court geometry (virtual units)
// ---------------------------------------------------------------------------
export const WORLD_WIDTH = 1200;
export const WORLD_HEIGHT = 675;
export const CENTER_X = WORLD_WIDTH / 2; // 600 — the net line
export const FLOOR_Y = 588; // y of the court floor; shuttle dies here

// Rear baselines — the ONLY out-of-bounds limits (2D side view, no side lines).
export const LEFT_BASELINE = 96;
export const RIGHT_BASELINE = WORLD_WIDTH - 96; // 1104

// Net
export const NET_HEIGHT = 150;
export const NET_TOP_Y = FLOOR_Y - NET_HEIGHT; // 438
export const NET_HALF_THICKNESS = 5; // collision half-width around CENTER_X

// ---------------------------------------------------------------------------
// Player kinematics
// ---------------------------------------------------------------------------
export const PLAYER_HALF_WIDTH = 20; // torso half-width for bounds
export const PLAYER_HEIGHT = 118; // feet-to-head standing height
export const PLAYER_SHOULDER_Y_OFFSET = 92; // above feet
export const CENTER_KEEPOUT = 30; // how far from the net a player must stay

// Horizontal bounds per side (feet x). Players can never cross the net line.
export const LEFT_MIN_X = LEFT_BASELINE + PLAYER_HALF_WIDTH; // stay near own court
export const LEFT_MAX_X = CENTER_X - CENTER_KEEPOUT;
export const RIGHT_MIN_X = CENTER_X + CENTER_KEEPOUT;
export const RIGHT_MAX_X = RIGHT_BASELINE - PLAYER_HALF_WIDTH;

export const PLAYER_ACCEL = 4600; // ground horizontal acceleration
export const PLAYER_AIR_ACCEL = 2600; // reduced air control
export const PLAYER_MAX_SPEED = 540;
export const PLAYER_FRICTION = 4200; // ground decel when no input
export const PLAYER_GRAVITY = 2150; // downward accel while airborne
export const JUMP_SPEED = 760; // initial upward speed on jump
export const DIVE_SPEED = 720; // horizontal burst on a grounded dive (smash)
export const DIVE_DURATION = 0.28; // seconds a dive lunge lasts

// ---------------------------------------------------------------------------
// Racket / hitting
// ---------------------------------------------------------------------------
export const RACKET_REACH = 60; // horizontal offset of racket centre from body
export const RACKET_CENTER_Y_OFFSET = 96; // racket centre height above feet
export const RACKET_HIT_RADIUS = 50; // contact radius around racket centre
export const RACKET_ARC_SPAN = 78; // vertical span mapping contact → shot type
export const HIT_COOLDOWN = 0.12; // seconds after a hit before same shuttle re-contacts

// Outgoing shot speeds
export const SWING_SPEED = 1360; // normal stroke
export const SMASH_SPEED = 1820; // smash held
export const DRIVE_SPEED = 1500; // flat high-contact drive
export const PLAYER_VEL_TRANSFER = 0.28; // fraction of player velocity added to shot

// Shot elevation angles (positive = upward launch)
export const ANGLE_LOW_CONTACT = 60 * DEG; // low contact → lofted clear
export const ANGLE_HIGH_CONTACT = -20 * DEG; // high contact → downward drive
export const SMASH_ANGLE_BONUS = 14 * DEG; // extra steepness when smashing

// ---------------------------------------------------------------------------
// Shuttle physics
// ---------------------------------------------------------------------------
export const SHUTTLE_RADIUS = 8;
export const SHUTTLE_GRAVITY = 1680;
// Quadratic air drag: a_drag = -DRAG_K * |v| * v. High coefficient → the sharp,
// asymmetric badminton arc. Tuned so a full clear crosses the court in ~1.7 s.
export const DRAG_K = 0.00115;
export const SHUTTLE_MAX_SPEED = 2600; // clamp to keep integration stable

// Serve
export const SERVE_WINDOW = 5.0; // seconds before auto-serve
export const SERVE_SPEED = 980; // lofted underhand serve speed
export const SERVE_ANGLE = 56 * DEG; // upward launch angle of a serve
export const SERVE_SHUTTLE_Y_OFFSET = 70; // shuttle height above server's feet at serve

// ---------------------------------------------------------------------------
// Scoring / match
// ---------------------------------------------------------------------------
export const POINTS_TO_WIN_GAME = 11;
export const WIN_BY = 2;
export const GAME_POINT_CAP = 15;
export const GAMES_TO_WIN_MATCH = 2; // best of 3
export const DECIDER_SWAP_SCORE = 6; // swap ends at 6 in the deciding game

// Rally pacing (seconds)
export const POINT_FREEZE_TIME = 1.6; // pause on "Point!" before next serve
export const GAME_FREEZE_TIME = 3.0; // pause on "Game!"
export const MATCH_FREEZE_TIME = 4.0; // pause on "Match!"
