// Procedural articulated player figure. A pose is a set of endpoint positions in
// a canonical "facing-right" local space (origin at the feet, +x forward, +y
// DOWN toward the floor, so heights are negative). Knees and elbows are derived
// by bending the mid-point of each limb, which keeps feet planted and hands
// where the pose asks. Poses are smoothed frame-to-frame so motion reads fluidly.

import { SWING_DURATION } from '@badminton/shared';
import type { PlayerAnim, PlayerState } from '@badminton/shared';
import { FIGURE, rgba, type Kit } from './palette.js';

interface Pt {
  x: number;
  y: number;
}
interface Pose {
  hip: Pt;
  shoulder: Pt;
  head: Pt;
  frontFoot: Pt;
  backFoot: Pt;
  frontHand: Pt;
  backHand: Pt;
  kneeBendF: number;
  kneeBendB: number;
  elbowBend: number;
  racketAngle: number; // degrees, 0 = pointing up
  headR: number;
}

const p = (x: number, y: number): Pt => ({ x, y });

function lerpPt(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
function lp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpPose(a: Pose, b: Pose, t: number): Pose {
  return {
    hip: lerpPt(a.hip, b.hip, t),
    shoulder: lerpPt(a.shoulder, b.shoulder, t),
    head: lerpPt(a.head, b.head, t),
    frontFoot: lerpPt(a.frontFoot, b.frontFoot, t),
    backFoot: lerpPt(a.backFoot, b.backFoot, t),
    frontHand: lerpPt(a.frontHand, b.frontHand, t),
    backHand: lerpPt(a.backHand, b.backHand, t),
    kneeBendF: lp(a.kneeBendF, b.kneeBendF, t),
    kneeBendB: lp(a.kneeBendB, b.kneeBendB, t),
    elbowBend: lp(a.elbowBend, b.elbowBend, t),
    racketAngle: lp(a.racketAngle, b.racketAngle, t),
    headR: lp(a.headR, b.headR, t),
  };
}

function basePose(): Pose {
  return {
    hip: p(0, -60),
    shoulder: p(3, -96),
    head: p(5, -119),
    frontFoot: p(13, 0),
    backFoot: p(-16, 0),
    frontHand: p(30, -104),
    backHand: p(-15, -72),
    kneeBendF: 7,
    kneeBendB: 6,
    elbowBend: 6,
    racketAngle: -22,
    headR: 13,
  };
}

function computeTargetPose(anim: PlayerAnim, clock: number, swingProg: number): Pose {
  const pose = basePose();
  switch (anim) {
    case 'run': {
      const ph = clock * 12;
      const s = Math.sin(ph);
      const c = Math.cos(ph);
      pose.frontFoot = p(14 + s * 18, -Math.max(0, s) * 12);
      pose.backFoot = p(-16 + -s * 18, -Math.max(0, -s) * 12);
      pose.frontHand = p(26 + c * 8, -100 - c * 4);
      pose.backHand = p(-18 - c * 10, -74 + c * 6);
      pose.hip = p(0, -58 + Math.abs(s) * 3);
      pose.shoulder = p(4, -95);
      pose.head = p(6, -118);
      pose.kneeBendF = 10;
      pose.kneeBendB = 10;
      break;
    }
    case 'jump': {
      pose.frontFoot = p(10, -22);
      pose.backFoot = p(-12, -30);
      pose.hip = p(0, -66);
      pose.shoulder = p(2, -100);
      pose.head = p(3, -122);
      pose.frontHand = p(26, -128);
      pose.backHand = p(-18, -96);
      pose.kneeBendF = 16;
      pose.kneeBendB = 18;
      pose.racketAngle = -8;
      break;
    }
    case 'swing': {
      const t = swingProg;
      pose.frontHand = lerpPt(p(-4, -122), p(44, -86), t);
      pose.racketAngle = lp(-70, 46, t);
      pose.shoulder = p(2 + t * 6, -96);
      pose.backHand = p(-18, -70);
      pose.frontFoot = p(16, 0);
      pose.backFoot = p(-18, 0);
      break;
    }
    case 'smash': {
      const t = swingProg;
      pose.frontHand = lerpPt(p(8, -134), p(48, -92), t);
      pose.racketAngle = lp(-96, 60, t);
      pose.shoulder = p(2 + t * 8, -98);
      pose.backHand = p(-20, -84);
      pose.frontFoot = p(12, -6);
      pose.backFoot = p(-14, -10);
      pose.hip = p(0, -62);
      pose.head = p(4, -120);
      break;
    }
    case 'dive': {
      pose.hip = p(6, -42);
      pose.shoulder = p(20, -70);
      pose.head = p(30, -86);
      pose.frontFoot = p(48, -4);
      pose.backFoot = p(-30, 0);
      pose.frontHand = p(56, -54);
      pose.backHand = p(-6, -50);
      pose.kneeBendF = 4;
      pose.kneeBendB = 3;
      pose.racketAngle = 30;
      break;
    }
    case 'celebrate': {
      const b = Math.abs(Math.sin(clock * 6)) * 8;
      pose.hip = p(0, -62 - b);
      pose.shoulder = p(2, -98 - b);
      pose.head = p(3, -122 - b);
      pose.frontHand = p(24, -138 - b);
      pose.backHand = p(-22, -138 - b);
      pose.frontFoot = p(12, 0);
      pose.backFoot = p(-14, 0);
      pose.racketAngle = -20;
      break;
    }
    case 'slump': {
      pose.hip = p(-2, -52);
      pose.shoulder = p(-6, -84);
      pose.head = p(-10, -100);
      pose.frontHand = p(8, -58);
      pose.backHand = p(-22, -56);
      pose.kneeBendF = 14;
      pose.kneeBendB = 12;
      pose.racketAngle = 60;
      pose.headR = 13;
      break;
    }
    case 'idle':
    default: {
      const bob = Math.sin(clock * 2.2) * 1.6;
      pose.hip = p(0, -60 + bob);
      pose.shoulder = p(3, -96 + bob);
      pose.head = p(5, -119 + bob);
      break;
    }
  }
  return pose;
}

/** Midpoint of a→b, pushed perpendicular-ish forward by `bend` (a bent joint). */
function joint(a: Pt, b: Pt, bend: number): Pt {
  return { x: (a.x + b.x) * 0.5 + bend, y: (a.y + b.y) * 0.5 };
}

function limb(ctx: CanvasRenderingContext2D, a: Pt, j: Pt, b: Pt, w: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(j.x, j.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function drawPose(ctx: CanvasRenderingContext2D, pose: Pose, kit: Kit): void {
  const { hip, shoulder, head } = pose;

  // Back limbs first (depth).
  const backKnee = joint(hip, pose.backFoot, -pose.kneeBendB);
  limb(ctx, hip, backKnee, pose.backFoot, 11, kit.dark);
  const backElbow = joint(shoulder, pose.backHand, -pose.elbowBend);
  limb(ctx, shoulder, backElbow, pose.backHand, 8, kit.dark);

  // Torso (kit-coloured volume).
  limb(ctx, hip, joint(hip, shoulder, 0), shoulder, 24, kit.kit);

  // Front leg.
  const frontKnee = joint(hip, pose.frontFoot, pose.kneeBendF);
  limb(ctx, hip, frontKnee, pose.frontFoot, 12, kit.dark);

  // Head + headband.
  ctx.fillStyle = FIGURE.skin;
  ctx.beginPath();
  ctx.arc(head.x, head.y, pose.headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = kit.kit;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(head.x, head.y, pose.headR - 1, Math.PI * 1.05, Math.PI * 1.95);
  ctx.stroke();

  // Front (racket) arm on top.
  const frontElbow = joint(shoulder, pose.frontHand, pose.elbowBend + 2);
  limb(ctx, shoulder, frontElbow, pose.frontHand, 8, kit.glow);

  drawRacket(ctx, pose.frontHand, pose.racketAngle);
}

function drawRacket(ctx: CanvasRenderingContext2D, hand: Pt, angleDeg: number): void {
  const a = (angleDeg - 90) * (Math.PI / 180); // 0° = pointing up
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const shaftLen = 26;
  const headCx = hand.x + dx * (shaftLen + 12);
  const headCy = hand.y + dy * (shaftLen + 12);

  // Grip + shaft.
  ctx.strokeStyle = FIGURE.racketGrip;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(hand.x, hand.y);
  ctx.lineTo(hand.x + dx * shaftLen, hand.y + dy * shaftLen);
  ctx.stroke();

  // Oval head.
  ctx.save();
  ctx.translate(headCx, headCy);
  ctx.rotate(a + Math.PI / 2);
  ctx.strokeStyle = FIGURE.racket;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.ellipse(0, 0, 9, 13, 0, 0, Math.PI * 2);
  ctx.stroke();
  // Strings.
  ctx.strokeStyle = rgba(FIGURE.racket, 0.4);
  ctx.lineWidth = 1;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 4.5, -11);
    ctx.lineTo(i * 4.5, 11);
    ctx.stroke();
  }
  ctx.restore();
}

/** Persistent per-figure pose smoothing so state changes don't pop. */
export class FigureRenderer {
  private smoothed = new Map<number, Pose>();

  draw(
    ctx: CanvasRenderingContext2D,
    player: PlayerState,
    x: number,
    y: number,
    kit: Kit,
    dtSmooth: number,
  ): void {
    const swingProg =
      player.swingTimer > 0 ? 1 - player.swingTimer / SWING_DURATION : 1;
    const target = computeTargetPose(player.anim, player.animClock, swingProg);

    let cur = this.smoothed.get(player.id);
    if (!cur) {
      cur = target;
    } else {
      // Snap swing/smash (they are already time-parameterised); ease the rest.
      const rate =
        player.anim === 'swing' || player.anim === 'smash' || player.anim === 'dive'
          ? 1
          : 1 - Math.pow(0.0001, dtSmooth);
      cur = lerpPose(cur, target, Math.min(1, rate));
    }
    this.smoothed.set(player.id, cur);

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(player.facing, 1);
    drawPose(ctx, cur, kit);
    ctx.restore();
  }
}
