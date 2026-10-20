// A bed-slinger FDM printer: nozzle, moving axes, filament. Run: node build.mjs [--light]
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as M from "./rig.mjs";

const SKILL = join(homedir(), ".claude/skills/anatomy");
const load = (file) => import(pathToFileURL(join(SKILL, file)).href);
const k = await load("kit/iso-kit.mjs");
const G = await load("kit/lathe.mjs");
const { kitScript } = await load("scripts/inline-kit.mjs");

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const OUT = join(HERE, theme === "light" ? "printer-light.html" : "printer.html");

const WIDTH = 600;
const HEIGHT = 540;

// ---------------------------------------------------------------- world (millimetres, z up)
const BASE = { x: -170, y: -125, w: 340, d: 260, r: 12 };
const BASE_H = 36;
const FOOT_H = 6;
const TOWER_L = { x: -152, y: -72, w: 44, d: 44, r: 4 };
const TOWER_R = { x: 108, y: -72, w: 44, d: 44, r: 4 };
const TOWER_LOW = 76; // top of the motor housing
const TOWER_TOP = 205;
const BRACE = { x: -108, y: -57, w: 216, d: 14, r: 2 };
const BRACE_Z = 191;

const RAIL_X = [-40, 40];
const RAIL_TOP = BASE_H + 6;
const BLOCK_TOP = BASE_H + 10; // bushing blocks and the underside of the plate
const PLATE_Z = 46;
const PLATE = { x: -76, y: -72, w: 152, d: 144, r: 6 };
const SPRING_Z = [50, 60];
const PCB_Z = 60;
const SHEET_Z = 62.4;
const BED_TOP = 63.6;
const TIP0 = BED_TOP + M.LAYER; // nozzle tip at the first layer, gantry at rest
const PART = { x: -M.PART.half, y: -M.PART.half, w: M.PART.half * 2, d: M.PART.half * 2, r: M.PART.r };

const SPOOL = { x: 0, y: -50, z: TOWER_TOP + 46, r: 40, core: 34, w: 36 };

// beam, relative to the nozzle tip
const BEAM = { x: -102, y: -57, w: 204, d: 20, r: 2 };
const BEAM_Z0 = 52;
const BEAM_Z1 = 72;
const HEAD_RANGE = M.PART.half;

// ---------------------------------------------------------------- camera
const extremes = [
  ...k.boxCorners(BASE, -FOOT_H, BASE_H),
  [TOWER_L.x, TOWER_L.y, TOWER_TOP + 3],
  [TOWER_R.x + TOWER_R.w, TOWER_R.y + TOWER_R.d, TOWER_TOP + 3],
  [SPOOL.x, SPOOL.y, SPOOL.z + SPOOL.r + 2],
  [SPOOL.x, SPOOL.y, SPOOL.z - 4],
];
const P = k.fitProjection(extremes, WIDTH, HEIGHT, { pad: 18, azimuth: 56, elevation: 28 });

const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const at = (point) => k.iso(point, P);
const byDepth = (points, z = 0) => [...points].sort((a, b) => k.depthOf([a[0], a[1], z], P) - k.depthOf([b[0], b[1], z], P));
const slab = (plan, z, h, o = {}) => S(k.slabOf(plan, z, h, P, o.steps ?? 4, o.bevel ?? 0.5), { tone: o.tone ?? "mid", crease: o.crease, inner: o.inner ?? "", lit: o.lit });
const cyl = (x, y, r, z, h, o = {}) => S(k.cylinder(x, y, r, z, h, P, o.steps ?? 24, o.bevel ?? 0), { tone: o.tone ?? "mid", crease: o.crease, inner: o.inner ?? "", lit: o.lit });
const grow = (plan, by) => k.insetPlan(plan, -by);
const onY = (y, points, closed = true) => k.pathOf(points.map(([x, z]) => at([x, y, z])), closed);
const onX = (x, points, closed = true) => k.pathOf(points.map(([y, z]) => at([x, y, z])), closed);
const rrect = (x0, z0, x1, z1, r = 1.5, n = 3) => {
  const out = [];
  const corner = (cx, cz, a0) => {
    for (let i = 0; i <= n; i++) {
      const a = ((a0 + (90 * i) / n) * Math.PI) / 180;
      out.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]);
    }
  };
  corner(x1 - r, z0 + r, -90);
  corner(x1 - r, z1 - r, 0);
  corner(x0 + r, z1 - r, 90);
  corner(x0 + r, z0 + r, 180);
  return out;
};
const dotsOn = (points, o = {}) => D(points.map((p) => at(p)), { size: o.size ?? 0.45, tone: o.tone ?? "mid" });

// ---------------------------------------------------------------- base
const DIAL = { x: 122, y: 44 };
const dialAngle = (share) => (-135 + 270 * share) * (Math.PI / 180);
function dialPointer(share) {
  const a = dialAngle(share);
  return k.lineOnTop([DIAL.x, DIAL.y], [DIAL.x + 6.2 * Math.sin(a), DIAL.y - 6.2 * Math.cos(a)], BASE_H + 7.8, P);
}
function base() {
  const out = [`<path class="iso-halo" d="${k.haloOf(BASE, -FOOT_H, BASE_H + FOOT_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(BASE, 26))) {
    out.push(cyl(x, y, 9, -FOOT_H, 1.8, { tone: "lo", steps: 28 }));
    out.push(cyl(x, y, 7, -FOOT_H + 1.8, FOOT_H - 1.8, { tone: "mid", steps: 28 }));
  }
  const front = BASE.y + BASE.d;
  const right = BASE.x + BASE.w;
  out.push(S(k.slabOf(BASE, 0, BASE_H, P, 8, 1.2), { tone: "lo", inner: L(k.sideSeam(BASE, 31, P, 8), { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(BASE, 6), BASE_H, P), { tone: "faint" }));
  // screws at the four corners
  const screws = k.corners(BASE, 13);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.6, BASE_H, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, BASE_H])), { size: 0.5 }));

  // speed dial: a knurled knob on a scaled plate, its pointer turned by the page
  const dialPlate = DIAL;
  out.push(S(k.cylinder(DIAL.x, DIAL.y, 16, BASE_H, 0.8, P, 40), { tone: "lo", crease: "none" }));
  const dialTicks = k.radialTicks(DIAL.x, DIAL.y, 16, 24, 6, BASE_H + 0.8, [2, 3.4], P, -0.75 * Math.PI, 1.5 * Math.PI);
  out.push(L(dialTicks.minor, { tone: "lo" }), L(dialTicks.major, { tone: "mid" }));
  out.push(S(k.cylinder(DIAL.x, DIAL.y, 8.6, BASE_H + 0.8, 7, P, 36, 0.5), { tone: "mid" }));
  out.push(L(k.knurl(DIAL.x, DIAL.y, 8.6, BASE_H + 0.8, BASE_H + 7.8, 40, P), { tone: "lo" }));
  out.push(L(k.ring(DIAL.x, DIAL.y, 6.4, BASE_H + 7.8, P, 32), { tone: "faint" }));
  out.push(`<path data-part="dial-pointer" class="iso-line" data-tone="hi" data-free="end" style="stroke-width:1.3" d="${dialPointer(0.5)}"/>`);
  out.push(D([at([DIAL.x, DIAL.y, BASE_H + 7.8])], { size: 0.8, tone: "hi" }));
  // spare nozzles and a hex key in a tray at the left
  const tray = { x: -152, y: -4, w: 48, d: 70, r: 3 };
  out.push(S(k.slabOf(tray, BASE_H, 2.2, P, 4, 0.4), { tone: "lo", crease: "lo" }));
  out.push(L(k.planOutline(k.insetPlan(tray, 3), BASE_H + 2.2, P, 3), { tone: "faint" }));
  for (const [i, y] of [10, 22, 34, 46].entries()) {
    const x = -140;
    out.push(S(k.extrude(k.circleRing(x, y, 3.6, 6), BASE_H + 2.2, 3.4, P), { tone: "hi" }));
    out.push(S(k.cylinder(x, y, 2.3, BASE_H + 5.6, 2.6, P, 12), { tone: "mid" }));
    out.push(S(k.cylinder(x, y, 1.1, BASE_H + 8.2, 1.4, P, 10), { tone: "mid", crease: "none" }));
  }
  out.push(S(k.slabOf({ x: -128, y: 8, w: 2.4, d: 40, r: 0.8 }, BASE_H + 2.2, 2.4, P, 2, 0.2), { tone: "mid", crease: "none" }));
  out.push(S(k.slabOf({ x: -128, y: 8, w: 22, d: 2.4, r: 0.8 }, BASE_H + 2.2, 2.4, P, 2, 0.2), { tone: "mid", crease: "none" }));
  // rear vent slots, closed outlines
  const vents = [];
  for (let i = 0; i < 9; i++) vents.push(k.planOutline({ x: -120 + i * 15, y: -113, w: 5, d: 16, r: 2.5 }, BASE_H, P, 4));
  out.push(L(vents.join(""), { tone: "lo" }));
  // front ruler strip on the top face
  const strip = { x: -100, y: 118, w: 200, d: 7, r: 1 };
  out.push(S(k.slabOf(strip, BASE_H, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 4, 5, strip.y + 0.8, BASE_H + 0.6, [2, 3.6], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(D([at([strip.x + 2, strip.y + 3.5, BASE_H + 0.6]), at([strip.x + strip.w - 2, strip.y + 3.5, BASE_H + 0.6])], { size: 0.45 }));
  // label plate on the top, front left
  const label = { x: -150, y: 110, w: 40, d: 16, r: 2 };
  out.push(S(k.slabOf(label, BASE_H, 0.8, P, 4), { tone: "lo", crease: "none" }));
  out.push(L(k.planOutline(k.insetPlan(label, 2), BASE_H + 0.8, P, 3), { tone: "faint" }));
  for (const [i, len] of [[0, 20], [1, 14], [2, 17]]) out.push(L(k.lineOnTop([label.x + 6, label.y + 5 + i * 3], [label.x + 6 + len, label.y + 5 + i * 3], BASE_H + 0.8, P), { tone: "lo", free: true }));
  out.push(D([at([label.x + 3, label.y + 3, BASE_H + 0.8]), at([label.x + label.w - 3, label.y + label.d - 3, BASE_H + 0.8])], { size: 0.4 }));
  // front face: power switch, card slot, USB port, engraved plate
  const faces = [];
  faces.push(onY(front, rrect(BASE.x + BASE.w - 60, 9, BASE.x + BASE.w - 40, 27, 3)));
  faces.push(onY(front, rrect(BASE.x + BASE.w - 56, 13, BASE.x + BASE.w - 44, 23, 2)));
  faces.push(onY(front, rrect(BASE.x + BASE.w - 110, 15, BASE.x + BASE.w - 78, 20, 1)));
  faces.push(onY(front, rrect(BASE.x + BASE.w - 150, 11, BASE.x + BASE.w - 134, 24, 2)));
  faces.push(onY(front, rrect(BASE.x + 14, 9, BASE.x + 90, 27, 3)));
  out.push(L(faces.join(""), { tone: "lo" }));
  out.push(L(onY(front, [[BASE.x + 56, 16], [BASE.x + 56, 20]], false), { tone: "mid", free: true }));
  const plateRules = [52, 36, 44].map((len, i) => L(onY(front, [[BASE.x + 22, 14 + i * 4 - 0.5], [BASE.x + 22 + len, 14 + i * 4 - 0.5]], false), { tone: "lo", free: true }));
  out.push(plateRules.join(""));
  out.push(dotsOn([[BASE.x + BASE.w - 150, front, 9], [BASE.x + 90, front, 9]]));
  // right face: vent slots
  const slots = [];
  for (let i = 0; i < 9; i++) slots.push(onX(right, rrect(BASE.y + 22 + i * 14, 11, BASE.y + 22 + i * 14 + 5, 27, 2.5)));
  out.push(L(slots.join(""), { tone: "lo" }));
  return out.join("");
}

// ---------------------------------------------------------------- Y axis: rails, belt, pulleys
const yBeltTeeth = (phase) => {
  const marks = [];
  const first = Math.ceil((-92 - phase) / 2.5);
  for (let i = first; i * 2.5 + phase < 92; i++) marks.push(k.lineOnTop([-3, i * 2.5 + phase], [3, i * 2.5 + phase], BASE_H + 1.2, P));
  return marks.join("");
};
function yAxis() {
  const out = [];
  for (const x of RAIL_X) {
    out.push(S(k.slabOf({ x: x - 4, y: -110, w: 8, d: 220, r: 1 }, BASE_H, 6, P, 3, 0.4), { tone: "mid" }));
    out.push(L(k.lineOnTop([x - 1.2, -108], [x - 1.2, 108], RAIL_TOP, P), { tone: "faint" }));
    out.push(L(k.lineOnTop([x + 1.2, -108], [x + 1.2, 108], RAIL_TOP, P), { tone: "faint" }));
    for (const y of [-114, 109]) {
      out.push(S(k.slabOf({ x: x - 8, y, w: 16, d: 5, r: 1.2 }, BASE_H, 9, P, 3, 0.5), { tone: "mid" }));
      out.push(dotsOn([[x, y + 2.5, BASE_H + 9]], { size: 0.5 }));
    }
  }
  // belt between the rails: a strip with teeth, pulleys at both ends
  const belt = { x: -3, y: -95, w: 6, d: 190, r: 0.6 };
  out.push(S(k.slabOf(belt, BASE_H, 1.2, P, 2), { tone: "lo", crease: "none" }));
  out.push(`<g data-part="ybelt">${L(yBeltTeeth(0), { tone: "lo" })}</g>`);
  out.push(cyl(0, -97, 7, BASE_H, 9, { steps: 24, tone: "mid" }));
  out.push(L(k.knurl(0, -97, 7, BASE_H, BASE_H + 9, 20, P), { tone: "lo" }));
  out.push(L(k.ring(0, -97, 5, BASE_H + 9, P, 20), { tone: "faint" }));
  out.push(D([at([0, -97, BASE_H + 9])], { size: 0.5, tone: "hi" }));
  out.push(cyl(0, 98, 6, BASE_H, 8, { steps: 24, tone: "mid" }));
  out.push(L(k.knurl(0, 98, 6, BASE_H, BASE_H + 8, 18, P), { tone: "lo" }));
  out.push(D([at([0, 98, BASE_H + 8])], { size: 0.5, tone: "hi" }));
  // belt tensioner at the front
  out.push(slab({ x: -9, y: 104, w: 18, d: 8, r: 1.5 }, BASE_H, 8, { steps: 3 }));
  out.push(dotsOn([[-5, 108, BASE_H + 8], [5, 108, BASE_H + 8]]));
  return out.join("");
}

// ---------------------------------------------------------------- towers
function tower(side) {
  const plan = side < 0 ? TOWER_L : TOWER_R;
  const out = [];
  const front = plan.y + plan.d;
  const inner = side < 0 ? plan.x + plan.w : plan.x; // face toward the middle
  const outer = side < 0 ? plan.x : plan.x + plan.w;
  const faceX = side < 0 ? inner : outer; // the x face the viewer sees
  out.push(S(k.slabOf(plan, BASE_H, TOWER_LOW - BASE_H, P, 4, 0.8), { tone: "mid", inner: L(k.sideSeam(plan, 39, P, 4), { tone: "faint" }) }));
  out.push(S(k.slabOf(grow(plan, 1.5), TOWER_LOW - 3, 3, P, 4, 0.4), { tone: "mid" }));
  out.push(S(k.slabOf(plan, TOWER_LOW, TOWER_TOP - 2 - TOWER_LOW, P, 4, 0.6), { tone: "mid" }));
  out.push(S(k.slabOf(grow(plan, 1), TOWER_TOP - 2, 2, P, 4, 0.5), { tone: "mid" }));
  const capScrews = k.corners(plan, 5);
  out.push(L(capScrews.map(([x, y]) => k.ring(x, y, 2, TOWER_TOP, P, 14)).join(""), { tone: "lo" }));
  out.push(D(capScrews.map(([x, y]) => at([x, y, TOWER_TOP])), { size: 0.5 }));
  out.push(L(k.planOutline(k.insetPlan(plan, 10), TOWER_TOP, P, 3), { tone: "faint" }));
  // V-slot style grooves on the front face, edge to edge, and on the outer face of the right tower
  const grooves = [plan.x + 14, plan.x + 30].map((x) => k.segment([x, front, TOWER_LOW], [x, front, TOWER_TOP - 2], P));
  out.push(L(grooves.join(""), { tone: "faint" }));
  if (side > 0) out.push(L([plan.y + 14, plan.y + 30].map((y) => k.segment([outer, y, TOWER_LOW], [outer, y, TOWER_TOP - 2], P)).join(""), { tone: "faint" }));
  // label plate (left) or the printer's own screen (right) on the housing
  if (side < 0) {
    out.push(L(onY(front, rrect(plan.x + 8, 48, plan.x + 36, 66, 2)), { tone: "lo" }));
    [0, 1, 2].forEach((i) => out.push(L(onY(front, [[plan.x + 12, 52 + i * 4.5], [plan.x + 12 + [18, 12, 15][i], 52 + i * 4.5]], false), { tone: "lo", free: true })));
    out.push(dotsOn([[plan.x + 10, front, 62.5], [plan.x + 34, front, 62.5]]));
  } else {
    out.push(lcd(plan));
  }
  // engraved nameplate on the column
  if (side < 0) {
    out.push(L(onY(front, rrect(plan.x + 9, 100, plan.x + 35, 112, 1.5)), { tone: "lo" }));
    out.push(L([[14, 24], [14, 30]].map(([a, b], i) => onY(front, [[plan.x + 13, 104 + i * 4], [plan.x + 13 + a + b - 14 + 4, 104 + i * 4]], false)).join(""), { tone: "lo", free: true }));
  } else {
    out.push(L(onX(outer, rrect(plan.y + 9, 100, plan.y + 35, 112, 1.5)), { tone: "lo" }));
    out.push(L([0, 1].map((i) => onX(outer, [[plan.y + 13, 104 + i * 4], [plan.y + 13 + [16, 11][i], 104 + i * 4]], false)).join(""), { tone: "lo", free: true }));
  }
  const slots = [];
  for (let i = 0; i < 5; i++) slots.push(onX(faceX, rrect(plan.y + 7 + i * 7.5, 42, plan.y + 7 + i * 7.5 + 4, 70, 2)));
  out.push(L(slots.join(""), { tone: "lo" }));
  return out.join("");
}


function lcd(plan) {
  const front = plan.y + plan.d;
  const out = [];
  out.push(L(onY(front, rrect(plan.x + 5, 42, plan.x + 39, 72, 3)), { tone: "lo" }));
  const screen = onY(front, rrect(plan.x + 8, 45, plan.x + 36, 69, 1.5));
  out.push(`<path class="pr-screen" d="${screen}"/>` + L(screen, { tone: "mid" }));
  const lines = [["NOZZLE " + M.NOZZLE_T + "C", 64.5], ["BED    60C", 58.5], ["LAYER 9/" + M.LAYERS, 52.5]];
  lines.forEach(([text, z], i) => {
    out.push(`<text class="pr-lcd-text"${i === 2 ? ' data-part="lcd-layer"' : ""} transform="${k.sideMatrix([plan.x + 10.5, front], z, P, "left")}" font-size="3.5">${text}</text>`);
  });
  out.push(dotsOn([[plan.x + 6.5, front, 43.5], [plan.x + 37.5, front, 43.5], [plan.x + 6.5, front, 70.5], [plan.x + 37.5, front, 70.5]], { size: 0.4 }));
  return out.join("");
}

// the Z lead screw seen through its slot in the inner face of the left tower
const SLOT = { y0: -67, y1: -39, z0: 86, z1: 192, depth: 10 };
const SLOT_X = TOWER_L.x + TOWER_L.w; // -108
const SCREW = { x: SLOT_X - SLOT.depth + 5, y: SLOT.y0 + 8, r: 4 };
const slotOpening = () => k.pathOf(rrect(SLOT.y0, SLOT.z0, SLOT.y1, SLOT.z1, 2, 3).map(([y, z]) => at([SLOT_X, y, z])), true);
function zScrew() {
  const out = [];
  const x1 = SLOT_X - SLOT.depth;
  const wall = (pts) => `<path class="iso-fill" d="${k.pathOf(pts.map((p) => at(p)), true)}"/>`;
  const inside = [];
  inside.push(`<path class="pr-bore" d="${k.pathOf([[SLOT.y0, SLOT.z0], [SLOT.y1, SLOT.z0], [SLOT.y1, SLOT.z1], [SLOT.y0, SLOT.z1]].map(([y, z]) => at([x1, y, z])), true)}"/>`);
  inside.push(`<path class="iso-shade" data-shade="1" d="${k.pathOf([[SLOT_X, SLOT.y0, SLOT.z0], [x1, SLOT.y0, SLOT.z0], [x1, SLOT.y0, SLOT.z1], [SLOT_X, SLOT.y0, SLOT.z1]].map((p) => at(p)), true)}"/>`);
  inside.push(`<path class="iso-top" d="${k.pathOf([[SLOT_X, SLOT.y0, SLOT.z0], [SLOT_X, SLOT.y1, SLOT.z0], [x1, SLOT.y1, SLOT.z0], [x1, SLOT.y0, SLOT.z0]].map((p) => at(p)), true)}"/>`);
  // screw: shaft, threads, coupler
  const sx = SCREW.x;
  const sy = SCREW.y;
  inside.push(S(k.cylinder(sx, sy, SCREW.r, SLOT.z0, SLOT.z1 - SLOT.z0 + 4, P, 20), { tone: "hi", crease: "none" }));
  const crests = [];
  for (let z = SLOT.z0 + 9; z < SLOT.z1 + 5; z += 2.4) crests.push(helixFront(sx, sy, SCREW.r, z, 2.4 * 4));
  inside.push(`<g data-part="zcrest">${L(crests.join(""), { tone: "lo" })}</g>`);
  inside.push(S(k.cylinder(sx, sy, 5.6, SLOT.z0, 11, P, 20), { tone: "mid" }));
  inside.push(L(k.knurl(sx, sy, 5.6, SLOT.z0, SLOT.z0 + 11, 14, P), { tone: "lo" }));
  inside.push(D([at([sx + 3.6, sy + 3.6, SLOT.z0 + 7])], { size: 0.45 }));
  out.push(`<clipPath id="pr-slot"><path d="${slotOpening()}"/></clipPath>`);
  out.push(`<g clip-path="url(#pr-slot)">${inside.join("")}</g>`);
  out.push(L(slotOpening(), { tone: "mid" }));
  return out.join("");
}
// half a turn of a thread crest on the visible side of a vertical screw
function helixFront(cx, cy, r, z, pitch) {
  const [vx, vy] = k.towardViewer(P);
  const facing = Math.atan2(vy, vx);
  const points = [];
  for (let i = 0; i <= 10; i++) {
    const a = facing - Math.PI / 2 + (i / 10) * Math.PI;
    points.push(at([cx + r * Math.cos(a), cy + r * Math.sin(a), z + (pitch * i) / 20]));
  }
  return k.pathOf(points);
}

function brace() {
  const out = [];
  out.push(S(k.slabOf(BRACE, BRACE_Z, TOWER_TOP - BRACE_Z, P, 3, 0.6), { tone: "mid" }));
  const screws = [-96, -60, 60, 96].map((x) => at([x, BRACE.y + BRACE.d / 2, TOWER_TOP]));
  out.push(D(screws, { size: 0.5 }));
  out.push(L(k.lineOnTop([BRACE.x + 4, BRACE.y + BRACE.d / 2], [BRACE.x + BRACE.w - 4, BRACE.y + BRACE.d / 2], TOWER_TOP, P), { tone: "faint", free: true }));
  return out.join("");
}

// ---------------------------------------------------------------- spool and holder
const SF = G.frameAlong([SPOOL.x, SPOOL.y, SPOOL.z], [1, 0, 0]);
const spoolPoint = (angle, r, x) => [x, SPOOL.y + r * Math.cos(angle), SPOOL.z + r * Math.sin(angle)];
function spoolBack() {
  const out = [];
  out.push(S(k.slabOf({ x: -34, y: BRACE.y, w: 4, d: BRACE.d, r: 1.5 }, TOWER_TOP, SPOOL.z + 8 - TOWER_TOP, P, 3, 0.4), { tone: "mid" }));
  out.push(D([at([-32, SPOOL.y, SPOOL.z])], { size: 0.6, tone: "hi" }));
  return out.join("");
}
function spoolBody() {
  const out = [];
  const w = SPOOL.w / 2;
  out.push(S(G.disc(-w, -w + 2.5, SPOOL.r, SF, P, { steps: 72 }), { tone: "mid" }));
  const wound = G.disc(-w + 2.5, w - 2.5, SPOOL.core, SF, P, { steps: 64 });
  const windings = [];
  for (let s = -w + 5; s < w - 4; s += 2.6) windings.push(G.arcOf(SF, s, SPOOL.core, P, { least: 0.02 }));
  out.push(S(wound, { tone: "hi", inner: L(windings.join(""), { tone: "lo" }), crease: "lo" }));
  out.push(S(G.disc(w - 2.5, w, SPOOL.r, SF, P, { steps: 72 }), { tone: "mid" }));
  return out.join("");
}
// everything on the near flange that turns with the spool
export function spoolFace(angle) {
  const rings = [];
  const x = SPOOL.w / 2;
  const holes = [];
  for (let i = 0; i < 5; i++) {
    const a = angle + (i * Math.PI * 2) / 5;
    holes.push(k.sideRing(spoolPoint(a, 23, x), 6.6, "x", P, 22));
  }
  rings.push(k.sideRing(spoolPoint(0, 0, x), SPOOL.core + 0.5, "x", P, 64));
  rings.push(k.sideRing(spoolPoint(0, 0, x), 11, "x", P, 32));
  return { holes: holes.join(""), rings: rings.join("") };
}
function spoolFront() {
  const out = [];
  const x = SPOOL.w / 2;
  const f = spoolFace(0);
  out.push(L(f.rings, { tone: "lo" }));
  out.push(`<g data-part="spool-holes">${L(f.holes, { tone: "lo" })}</g>`);
  out.push(D([at(spoolPoint(0, 0, x))], { size: 0.8, tone: "hi" }));
  // axle and nut ends, then the near upright
  out.push(S(G.disc(x, x + 12, 3, G.frameAlong([0, SPOOL.y, SPOOL.z], [1, 0, 0]), P, { steps: 18 }), { tone: "mid", crease: "none" }));
  out.push(S(k.slabOf({ x: 30, y: BRACE.y, w: 4, d: BRACE.d, r: 1.5 }, TOWER_TOP, SPOOL.z + 8 - TOWER_TOP, P, 3, 0.4), { tone: "mid" }));
  out.push(S(G.disc(34, 38, 4.6, G.frameAlong([0, SPOOL.y, SPOOL.z], [1, 0, 0]), P, { steps: 6 }), { tone: "mid" }));
  out.push(D([at([34, SPOOL.y, SPOOL.z]) ], { size: 0.01 }));
  return out.join("");
}

// ---------------------------------------------------------------- the bed: everything that rides on the Y rails (built at y = 0)
function vcoil(cx, cy, z0, z1, r, turns, perTurn = 16) {
  const [vx, vy] = k.towardViewer(P);
  const count = Math.round(turns * perTurn);
  const back = [];
  const front = [];
  let run = [];
  let near = null;
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const a = t * turns * Math.PI * 2;
    const facing = Math.cos(a) * vx + Math.sin(a) * vy > 0;
    const flat = at([cx + r * Math.cos(a), cy + r * Math.sin(a), z0 + (z1 - z0) * t]);
    if (near === null) near = facing;
    if (facing !== near) {
      run.push(flat);
      (near ? front : back).push(k.pathOf(run));
      run = [flat];
      near = facing;
      continue;
    }
    run.push(flat);
  }
  if (run.length > 1) (near ? front : back).push(k.pathOf(run));
  return { back: back.join(""), front: front.join("") };
}

function bed() {
  const out = [];
  // linear bushings: blocks that wrap the rails
  const blocks = [];
  for (const x of RAIL_X) for (const y of [-42, 42]) blocks.push([x, y]);
  for (const [x, y] of byDepth(blocks, BASE_H)) {
    const plan = { x: x - 9, y: y - 10, w: 18, d: 20, r: 2 };
    out.push(S(k.slabOf(plan, BASE_H, BLOCK_TOP - BASE_H, P, 3, 0.5), { tone: "mid", inner: L(k.sideSeam(plan, BASE_H + 3, P, 3), { tone: "faint" }) }));
    out.push(L(onY(y + 10, rrect(x - 5, BASE_H + 1, x + 5, BASE_H + 8, 1.2)), { tone: "lo" }));
    out.push(dotsOn([[x - 5, y - 6, BLOCK_TOP], [x + 5, y - 6, BLOCK_TOP], [x - 5, y + 6, BLOCK_TOP], [x + 5, y + 6, BLOCK_TOP]], { size: 0.4 }));
  }
  // levelling wheels under the plate corners
  const corners = [[-62, -56], [62, -56], [-62, 56], [62, 56]];
  for (const [x, y] of byDepth(corners, PLATE_Z)) {
    out.push(cyl(x, y, 7, BLOCK_TOP + 2, PLATE_Z - BLOCK_TOP - 2, { steps: 24, tone: "mid" }));
    out.push(L(k.knurl(x, y, 7, BLOCK_TOP + 2, PLATE_Z, 22, P), { tone: "lo" }));
  }
  // the carriage plate
  out.push(S(k.slabOf(PLATE, PLATE_Z, 4, P, 6, 0.7), { tone: "mid", inner: L(k.sideSeam(PLATE, PLATE_Z + 2, P, 6), { tone: "faint" }) }));
  out.push(dotsOn(k.corners(PLATE, 3.4).map(([x, y]) => [x, y, PLATE_Z + 4]), { size: 0.5 }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 1.6), PLATE_Z + 4, P, 5), { tone: "faint" }));
  // levelling bolts and springs, far to near
  for (const [x, y] of byDepth(corners, PLATE_Z)) {
    const coil = vcoil(x, y, SPRING_Z[0], SPRING_Z[1], 4.6, 5);
    out.push(L(coil.back, { tone: "lo" }));
    out.push(cyl(x, y, 1.6, SPRING_Z[0], SPRING_Z[1] - SPRING_Z[0], { steps: 12, tone: "mid", crease: "none" }));
    out.push(L(coil.front, { tone: "mid" }));
  }
  // heated bed and the print sheet
  const pcb = { x: -70, y: -70, w: 140, d: 140, r: 4 };
  out.push(S(k.slabOf(pcb, PCB_Z, SHEET_Z - PCB_Z, P, 5, 0.5), { tone: "lo", inner: L(k.sideSeam(pcb, PCB_Z + 1.2, P, 5), { tone: "faint" }) }));
  const sheet = { x: -69, y: -69, w: 138, d: 138, r: 3 };
  out.push(S(k.slabOf({ x: -62, y: 68, w: 16, d: 9, r: 2 }, SHEET_Z, BED_TOP - SHEET_Z, P, 3), { tone: "mid", crease: "none" }));
  out.push(S(k.slabOf(sheet, SHEET_Z, BED_TOP - SHEET_Z, P, 5, 0.3), { tone: "mid", crease: "lo" }));
  out.push(L(k.planOutline(k.insetPlan(sheet, 3), BED_TOP, P, 4), { tone: "faint" }));
  out.push(dotsOn([[-65.5, -65.5, BED_TOP], [65.5, -65.5, BED_TOP], [65.5, 65.5, BED_TOP], [-65.5, 65.5, BED_TOP]], { size: 0.45 }));
  // two binder clips
  for (const x of [-72.5, 63.5]) {
    const clip = { x, y: -8, w: 9, d: 16, r: 1.5 };
    out.push(S(k.slabOf(clip, 58.4, 8.8, P, 3, 0.4), { tone: "lo", inner: L(k.sideSeam(clip, 62.4, P, 3), { tone: "faint" }) }));
    out.push(L(k.lineOnTop([x, 0], [x + 9, 0], 67.2, P), { tone: "faint" }));
  }
  // the part and the bead, drawn by the page
  out.push(`<g data-part="print"><g data-part="print-body"></g><g data-part="trail"></g></g>`);
  return out.join("");
}

// ---------------------------------------------------------------- the gantry: the X beam, its belt and motor, riding up the towers (built at tip = TIP0)
const BELT = { x: -92, y: -55, w: 184, d: 6 };
const beltTeeth = (phase) => {
  const marks = [];
  const pitch = 2.5;
  const first = Math.ceil((BELT.x + 1 - phase) / pitch);
  for (let i = first; i * pitch + phase < BELT.x + BELT.w - 1; i++) {
    const x = i * pitch + phase;
    marks.push(k.lineOnTop([x, BELT.y], [x, BELT.y + BELT.d], TIP0 + BEAM_Z1 + 0.8, P));
  }
  return marks.join("");
};
function gantryBack() {
  const T = TIP0;
  const out = [];
  // left end plate and the X motor behind it (the motor sits flush on the plate's rear face)
  out.push(S(k.slabOf({ x: -108, y: -62, w: 6, d: 30, r: 2 }, T + 46, 32, P, 3, 0.4), { tone: "mid" }));
  out.push(dotsOn([[-102, -59.5, T + 49], [-102, -34.5, T + 49], [-102, -59.5, T + 75], [-102, -34.5, T + 75]]));
  const F = G.frameAlong([-87, -62, T + 62], [0, -1, 0]);
  const c = 4;
  const half = 21;
  const octagon = [[-half + c, -half], [half - c, -half], [half, -half + c], [half, half - c], [half - c, half], [-half + c, half], [-half, half - c], [-half, -half + c]];
  out.push(S(G.prismOf(F, octagon, 0, 25, P), { tone: "mid" }));
  return out.join("");
}
function gantryBeam() {
  const T = TIP0;
  const out = [];
  out.push(S(k.slabOf(BEAM, T + BEAM_Z0, BEAM_Z1 - BEAM_Z0, P, 3, 0.6), { tone: "mid" }));
  const front = BEAM.y + BEAM.d;
  out.push(L([T + 58, T + 66].map((z) => k.segment([BEAM.x, front, z], [BEAM.x + BEAM.w, front, z], P)).join(""), { tone: "faint" }));
  // belt, drive pulley, idler
  out.push(S(k.slabOf(BELT, T + BEAM_Z1, 0.8, P, 2), { tone: "lo", crease: "none" }));
  out.push(`<g data-part="xbelt">${L(beltTeeth(0), { tone: "lo" })}</g>`);
  out.push(cyl(-92, -52, 6.5, T + BEAM_Z1 + 0.8, 8, { steps: 24, tone: "mid" }));
  out.push(L(k.knurl(-92, -52, 6.5, T + BEAM_Z1 + 0.8, T + BEAM_Z1 + 8.8, 20, P), { tone: "lo" }));
  out.push(D([at([-92, -52, T + BEAM_Z1 + 8.8])], { size: 0.55, tone: "hi" }));
  out.push(cyl(92, -52, 5.5, T + BEAM_Z1 + 0.8, 6, { steps: 24, tone: "mid" }));
  out.push(D([at([92, -52, T + BEAM_Z1 + 6.8])], { size: 0.55, tone: "hi" }));
  return out.join("");
}
function gantryFront() {
  const T = TIP0;
  const out = [];
  out.push(S(k.slabOf({ x: 102, y: -62, w: 6, d: 30, r: 2 }, T + 46, 32, P, 3, 0.4), { tone: "mid" }));
  out.push(dotsOn([[105, -32, T + 49], [105, -32, T + 75]]));
  return out.join("");
}

// ---------------------------------------------------------------- the toolhead (built at x = 0, nozzle tip at z = TIP0, hot-end axis at y = 0)
const XG = -5.7; // extruder motor and drive gear axis; the filament runs 1.2 + 4.5 mm to the right of it
const ZG = 84; // gear height above the tip
const FIL_R = 1.2; // filament radius as drawn (real 0.875 mm, drawn about 1.4x so it reads)
const BORE_R = 1.4;
const ORIFICE_R = 0.28;
const GEAR = { r: 4.5, y0: -4, y1: 4 };
const IDLER = { x: 6.2, r: 5 };
const FAN = { x0: 12.5, x1: 22.5, half: 15, z: 44 };
const roundedSquare = (half, r, n = 4) => {
  const out = [];
  const corner = (cx, cy, a0) => {
    for (let i = 0; i <= n; i++) {
      const a = ((a0 + (90 * i) / n) * Math.PI) / 180;
      out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  };
  corner(half - r, -half + r, -90);
  corner(half - r, half - r, 0);
  corner(-half + r, half - r, 90);
  corner(-half + r, -half + r, 180);
  return out;
};
const halfDisc = (r, steps = 14) => Array.from({ length: steps + 1 }, (_, i) => {
  const a = Math.PI + (i / steps) * Math.PI;
  return [r * Math.cos(a), r * Math.sin(a)];
}); // the half of a round part behind the cut plane (y <= 0)
const octagon = (half, c) => [[-half + c, -half], [half - c, -half], [half, -half + c], [half, half - c], [half - c, half], [-half + c, half], [-half, half - c], [-half, -half + c]];
const circle3 = (cx, y, cz, r, n = 28) => k.pathOf(Array.from({ length: n }, (_, i) => at([cx + r * Math.cos((i / n) * Math.PI * 2), y, cz + r * Math.sin((i / n) * Math.PI * 2)])), true);
const cutPoly = (points, y = 0) => k.pathOf(points.map(([x, z]) => at([x, y, z])), true);
const [VX, VY] = k.towardViewer(P);
// where the filament line ends on the front rim of a bore in a horizontal face
const rimFront = (z, r) => at([r * VX, r * VY, z]);

// a tube-like line for the filament: dark edge, light core
const filamentLine = (d, extra = "") => `<g class="pr-filament"${extra}><path class="pr-fil-edge" d="${d}"/><path class="pr-fil-core" d="${d}"/></g>`;

function headRoof() {
  const T = TIP0;
  const out = [];
  for (const [x, y] of byDepth([[-17, -53], [17, -53], [-17, -41], [17, -41]], T + 72)) {
    out.push(cyl(x, y, 3, T + BEAM_Z1, 2, { steps: 14, tone: "lo" }));
  }
  out.push(S(k.slabOf({ x: -6, y: -55.5, w: 12, d: 7, r: 1 }, T + BEAM_Z1 + 0.8, 1.2, P, 2), { tone: "lo" }));
  const roof = { x: -25, y: -57, w: 50, d: 20, r: 2 };
  out.push(S(k.slabOf(roof, T + 74, 4, P, 3, 0.5), { tone: "mid" }));
  out.push(dotsOn([[-20, -52, T + 78], [20, -52, T + 78], [-20, -42, T + 78], [20, -42, T + 78]]));
  out.push(L(k.lineOnTop([roof.x, -47], [roof.x + roof.w, -47], T + 78, P), { tone: "faint" }));
  return out.join("");
}

function headPlate() {
  const T = TIP0;
  const out = [];
  const plate = { x: -30, y: -37, w: 58, d: 4, r: 2.5 };
  out.push(S(k.slabOf(plate, T + 10, 104, P, 4, 0.5), { tone: "mid", inner: L(k.sideSeam(plate, T + 62, P, 4), { tone: "faint" }) }));
  const front = plate.y + plate.d;
  out.push(dotsOn([[-26, front, T + 14], [24, front, T + 14], [-26, front, T + 110], [24, front, T + 110], [-26, front, T + 62], [24, front, T + 62]]));
  out.push(L([onY(front, rrect(-18, T + 20, 10, T + 30, 2)), onY(front, rrect(-18, T + 95, 10, T + 105, 2))].join(""), { tone: "lo" }));
  return out.join("");
}

function headWires() {
  const T = TIP0;
  const out = [];
  // heater cartridge: two leads from the block's rear to the carriage plate; thermistor and fan on their own
  out.push(wire([-7.2, -8, T + 15], [-7.2, -33, T + 15]));
  out.push(wire([-5.2, -8, T + 14], [-5.2, -33, T + 14]));
  out.push(wire([6.5, -8, T + 11.5], [6.5, -33, T + 11.5]));
  out.push(wire([17, -15, T + 40], [17, -33, T + 40]));
  return out.join("");
}
const wire = (a, b) => k.wireSvg(at(a), at(b), { tone: "lo", size: 0.9 });

function headMounts() {
  const T = TIP0;
  const out = [];
  out.push(S(k.slabOf({ x: -9, y: -33, w: 18, d: 24, r: 1.5 }, T + 34, 22, P, 3, 0.4), { tone: "mid" }));
  out.push(S(k.slabOf({ x: FAN.x0, y: -33, w: FAN.x1 - FAN.x0, d: 18, r: 1.5 }, T + 47, 10, P, 3, 0.4), { tone: "mid" }));
  out.push(dotsOn([[FAN.x1, -28, T + 52], [FAN.x1, -20, T + 52], [0, -33 + 24, T + 56]], { size: 0.4 }));
  return out.join("");
}

function headMotor() {
  const T = TIP0;
  const out = [];
  const F = G.frameAlong([XG, -8, T + ZG], [0, -1, 0]);
  out.push(S(G.prismOf(F, octagon(21, 4), 0, 25, P), { tone: "mid" }));
  out.push(L(G.circleOf(F, 0, 14, P, 40), { tone: "faint" }));
  out.push(S(G.disc(-2, 0, 11, F, P, { steps: 40 }), { tone: "mid" }));
  out.push(S(G.disc(-14, 0, 2.5, F, P, { steps: 16 }), { tone: "hi", crease: "none" }));
  const screws = [[-15.5, -15.5], [15.5, -15.5], [-15.5, 15.5], [15.5, 15.5]].map(([dx, dz]) => [XG + dx, -8, T + ZG + dz]);
  out.push(dotsOn(screws, { size: 0.55 }));
  out.push(L(screws.map((p) => circle3(p[0], -8, p[2], 2.2, 12)).join(""), { tone: "lo" }));
  // seam where the stator stack meets the rear cap
  out.push(L(G.circleOf(F, 18, 20.4, P, 40), { tone: "faint" }));
  return out.join("");
}

// the cut-away hot end: nozzle, heater block, heat break. Everything behind the plane y = 0.
function hotEnd() {
  const T = TIP0;
  const out = [];
  const FZ = G.frameAlong([0, 0, T], [0, 0, 1]);
  // nozzle cone: its back half is just a silhouette; the cut face is drawn over it
  const cone = G.solidOf([[0, 1.4], [5.2, 3.2]], FZ, P, { steps: 24 });
  out.push(S({ ...cone, shades: ["", "", "", ""], top: "" }, { tone: "mid", crease: "none" }));
  const cutShade = Math.min(3, Math.max(0, Math.floor(((VY ? 0 : 0) + (Math.cos((56 * Math.PI) / 180) + 1)) / 2 * 4)));
  const cone2d = [[-1.4, 0], [1.4, 0], [3.2, 5.2], [-3.2, 5.2]].map(([x, z]) => [x, T + z]);
  out.push(`<path class="iso-fill" d="${cutPoly(cone2d)}"/><path class="iso-shade" data-shade="${cutShade}" d="${cutPoly(cone2d)}"/><path class="iso-line iso-edge" data-tone="hi" d="${cutPoly(cone2d)}"/>`);
  // hex nut, half
  out.push(S(k.extrude([[4.1, 0], [2.05, -3.55], [-2.05, -3.55], [-4.1, 0]], T + 5.2, 3.8, P, { bevel: 0 }), { tone: "hi" }));
  // heater block, half
  out.push(S(k.extrude([[11, 0], [11, -8], [-11, -8], [-11, 0]], T + 9, 11, P, { bevel: 0.4 }), { tone: "hi" }));
  // heat break, half, with a collar
  out.push(S(k.extrude(halfDisc(2.8), T + 20, 12, P), { tone: "hi", crease: "none" }));
  out.push(S(k.extrude(halfDisc(4.6), T + 25, 2.2, P), { tone: "hi" }));
  return out.join("");
}

// what the cut plane shows: heater cartridge, thermistor and the filament channel with its three states
function hotEndCut() {
  const T = TIP0;
  const out = [];
  // cartridge and thermistor, cut across
  out.push(`<path class="iso-top" d="${circle3(-6.2, 0, T + 14.5, 3.3, 28)}"/>`);
  out.push(L(circle3(-6.2, 0, T + 14.5, 3.3, 28), { tone: "mid" }));
  out.push(L(circle3(-6.2, 0, T + 14.5, 2.4, 24), { tone: "lo" }));
  out.push(L(circle3(-6.2, 0, T + 14.5, 1.1, 14), { tone: "lo" }));
  out.push(`<path class="iso-top" d="${circle3(6.5, 0, T + 11.5, 1.9, 18)}"/>`);
  out.push(L(circle3(6.5, 0, T + 11.5, 1.9, 18), { tone: "mid" }));
  out.push(D([at([6.5, 0, T + 11.5])], { size: 0.45, tone: "hi" }));
  // the channel
  const cavity = [[-BORE_R, T + 32], [-BORE_R, T + 5.2], [-ORIFICE_R, T], [ORIFICE_R, T], [BORE_R, T + 5.2], [BORE_R, T + 32]];
  out.push(`<path class="pr-bore" d="${cutPoly(cavity)}"/>${L(cutPoly(cavity), { tone: "lo" })}`);
  const melt = [[-BORE_R, T + 22], [-BORE_R, T + 5.2], [-ORIFICE_R, T], [ORIFICE_R, T], [BORE_R, T + 5.2], [BORE_R, T + 22]];
  out.push(`<path class="pr-melt" d="${cutPoly(melt)}"/>`);
  const solid = [[-FIL_R, T + 32], [-FIL_R, T + 22], [FIL_R, T + 22], [FIL_R, T + 32]];
  out.push(`<path class="pr-solid" d="${cutPoly(solid)}"/>${L(cutPoly(solid), { tone: "lit" })}`);
  out.push(`<path class="iso-line pr-flow" data-tone="lit" data-free="" d="${k.pathOf([at([0, 0, T + 22]), at([0, 0, T + 0.4])])}"/>`);
  return out.join("");
}

function heatsink() {
  const T = TIP0;
  const out = [];
  out.push(cyl(0, 0, 5, T + 32, 26, { steps: 20, tone: "mid", crease: "none" }));
  for (let i = 0; i < 9; i++) out.push(cyl(0, 0, 11.5, T + 32 + i * 2.65, 1.4, { steps: 32, tone: "hi", bevel: 0.25 }));
  out.push(cyl(0, 0, 9.5, T + 55.4, 2.6, { steps: 28, tone: "hi", bevel: 0.3 }));
  out.push(cyl(0, 0, 4.2, T + 58, 6, { steps: 20, tone: "mid" }));
  out.push(L(k.sideArc(0, 0, 4.2, T + 61, P, 12), { tone: "faint" }));
  return out.join("");
}

function lowerGuide() {
  const T = TIP0;
  const out = [];
  out.push(S(k.slabOf({ x: -3, y: -8, w: 6, d: 5, r: 0.5 }, T + 64, 15, P, 2, 0), { tone: "mid", crease: "none" }));
  out.push(cyl(0, 0, 3, T + 64, 15, { steps: 18, tone: "mid" }));
  out.push(`<path class="pr-bore" d="${k.ring(0, 0, 1.8, T + 79, P, 16)}"/>` + L(k.ring(0, 0, 1.8, T + 79, P, 16), { tone: "lo" }));
  return out.join("");
}

function fan() {
  const T = TIP0;
  const out = [];
  const FF = G.frameAlong([FAN.x0, 0, T + FAN.z], [1, 0, 0]);
  out.push(S(G.prismOf(FF, roundedSquare(FAN.half, 3, 4), 0, FAN.x1 - FAN.x0, P), { tone: "mid" }));
  const face = FAN.x1;
  out.push(`<path class="pr-bore" d="${circle3x(face, T + FAN.z, 13.2, 40)}"/>` + L(circle3x(face, T + FAN.z, 13.2, 40), { tone: "mid" }));
  const screws = [[-12.3, -12.3], [12.3, -12.3], [-12.3, 12.3], [12.3, 12.3]].map(([dy, dz]) => [face, dy, T + FAN.z + dz]);
  out.push(dotsOn(screws, { size: 0.5 }));
  out.push(L(screws.map((p) => circle3x(face, p[2], 1.8, 12, p[1])).join(""), { tone: "lo" }));
  out.push(`<g data-part="fan-blades"></g>`);
  out.push(S(G.disc(FAN.x1 - FAN.x0 - 1.5, FAN.x1 - FAN.x0 + 0.5, 4.4, FF, P, { steps: 20 }), { tone: "hi", crease: "none" }));
  out.push(D([at([face + 0.5, 0, T + FAN.z])], { size: 0.55, tone: "hi" }));
  return out.join("");
}
// a circle on the vertical plane x = const (y, z around (cy, cz))
function circle3x(x, cz, r, n = 28, cy = 0) {
  return k.pathOf(Array.from({ length: n }, (_, i) => at([x, cy + r * Math.cos((i / n) * Math.PI * 2), cz + r * Math.sin((i / n) * Math.PI * 2)])), true);
}

function extruderFront() {
  const T = TIP0;
  const out = [];
  const F = G.frameAlong([XG, -8, T + ZG], [0, -1, 0]);
  const F2 = G.frameAlong([IDLER.x, -8, T + ZG], [0, -1, 0]);
  // tension adjuster: thumb screw through the arm, spring, knob
  const arm = { x: 6, y: -8, w: 12, d: 5, r: 1 };
  out.push(S(k.slabOf(arm, T + 72, 26, P, 2, 0.3), { tone: "mid" }));
  const cy = -5.5;
  const cz = T + 92;
  const spring = k.coil(18, 24.5, [cy, cz], 2.5, 5, "x", P);
  out.push(L(spring.back, { tone: "lo" }));
  out.push(S(G.disc(0, 29, 1.2, G.frameAlong([0, cy, cz], [1, 0, 0]), P, { steps: 10 }), { tone: "mid", crease: "none" }));
  out.push(L(spring.front, { tone: "mid" }));
  out.push(S(G.disc(0, 4, 4, G.frameAlong([24.5, cy, cz], [1, 0, 0]), P, { steps: 20 }), { tone: "mid" }));
  out.push(L(G.ribsOf(G.frameAlong([24.5, cy, cz], [1, 0, 0]), 0, 4, 4, 14, P), { tone: "lo" }));
  // idler bearing on its screw
  out.push(S(G.disc(-13, -5, 1.5, F2, P, { steps: 12 }), { tone: "mid", crease: "none" }));
  out.push(S(G.disc(-11, -5, IDLER.r, F2, P, { steps: 28 }), { tone: "hi" }));
  out.push(L(k.sideRing([IDLER.x, 3, T + ZG], 3.6, "y", P, 24), { tone: "lo" }));
  out.push(L(k.sideRing([IDLER.x, 3, T + ZG], 1.3, "y", P, 12), { tone: "lo" }));
  out.push(`<g data-part="idler-marks"></g>`);
  out.push(S(G.disc(-13.5, -11, 2.2, F2, P, { steps: 12 }), { tone: "mid" }));
  // drive gear
  out.push(S(G.disc(-4 - 8, -4, GEAR.r, F, P, { steps: 32 }), { tone: "hi" }));
  out.push(L(k.sideRing([XG, 4, T + ZG], 1.6, "y", P, 12), { tone: "lo" }));
  out.push(`<g data-part="gear-marks"></g>`);
  out.push(D([at([XG, 4, T + ZG])], { size: 0.5, tone: "hi" }));
  return out.join("");
}

function upperGuide() {
  const T = TIP0;
  const out = [];
  out.push(S(k.slabOf({ x: -3, y: -8, w: 6, d: 5, r: 0.5 }, T + 90, 14, P, 2, 0), { tone: "mid", crease: "none" }));
  out.push(cyl(0, 0, 3, T + 90, 14, { steps: 18, tone: "mid" }));
  out.push(`<path class="pr-bore" d="${k.ring(0, 0, 1.8, T + 104, P, 16)}"/>` + L(k.ring(0, 0, 1.8, T + 104, P, 16), { tone: "lo" }));
  return out.join("");
}
const nipFilament = () => {
  const T = TIP0;
  const top = at([0, 0, T + 90]);
  const bottom = rimFront(T + 79, 1.8);
  return filamentLine(k.pathOf([top, bottom]));
};

function head() {
  return [headRoof(), headPlate(), headWires(), headMounts(), headMotor(), hotEnd(), hotEndCut(), heatsink(), lowerGuide(), fan(), extruderFront(), nipFilament(), upperGuide()].join("");
}

// ---------------------------------------------------------------- scene assembly (static machine + bed + beam + head)
const defsAndBody = [
  base(),
  yAxis(),
  tower(-1),
  zScrew(),
  brace(),
  spoolBack(),
  spoolBody(),
  spoolFront(),
  `<g data-part="bed" transform="${k.translateAlong(P, [0, 0, 0])}">${bed()}</g>`,
  `<g data-part="gantry" transform="${k.translateAlong(P, [0, 0, 0])}">${gantryBack()}${gantryBeam()}${gantryFront()}<g data-part="head" transform="${k.translateAlong(P, [0, 0, 0])}">${head()}</g></g>`,
  `<g data-part="route"></g>`,
  tower(1),
];


// ---------------------------------------------------------------- live page
const rigSource = readFileSync(join(HERE, "rig.mjs"), "utf8");
const exported = [...rigSource.matchAll(/^export (?:const|function) (\w+)/gm)].map((m) => m[1]);
const rigScript = `const M = (() => {\n${rigSource.replace(/^export /gm, "")}\nreturn { ${exported.join(", ")} };\n})();`;

const DATA = {
  P,
  TIP0,
  BED_TOP,
  BASE_H,
  PART,
  XG,
  ZG,
  GEAR,
  IDLER,
  FAN,
  SPOOL,
  BELT,
  BEAM_Z1,
  FIL_R,
  face: { spool: SPOOL.w / 2 },
  DIAL,
};

const live = `
const DATA = ${JSON.stringify(DATA)};
${rigScript}
const { P, TIP0, BED_TOP, BASE_H, PART, XG, ZG, GEAR, IDLER, FAN, SPOOL, BELT } = DATA;
const stage = document.querySelector(".iso-stage");
const svgEl = stage.querySelector("svg");
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const part = (name) => svgEl.querySelector('[data-part="' + name + '"]');
const el = Object.fromEntries(["bed", "gantry", "head", "print-body", "trail", "xbelt", "ybelt", "gear-marks", "idler-marks", "fan-blades", "spool-holes", "route", "zcrest", "dial-pointer", "lcd-layer"].map((name) => [name, part(name)]));
const cam = cameraOf(P);
const [VX, VY] = towardViewer(P);
const clampTo = (value, low, high) => Math.min(high, Math.max(low, value));
const TAU = Math.PI * 2;
const circle = (cx, cz, r, y, n = 20) => pathOf(Array.from({ length: n }, (_, i) => iso([cx + r * Math.cos((i / n) * TAU), y, cz + r * Math.sin((i / n) * TAU)], P)), true);

// ---- things that turn
function gearMarks(theta) {
  const out = [];
  const count = 22;
  const cz = TIP0 + ZG;
  const ribs = [];
  for (let i = 0; i < count; i++) {
    const a = -theta + (i / count) * TAU;
    if (Math.cos(a) * cam.cosA * cam.cosE + Math.sin(a) * cam.sinE < 0.18) continue;
    ribs.push(segment([XG + GEAR.r * Math.cos(a), GEAR.y0, cz + GEAR.r * Math.sin(a)], [XG + GEAR.r * Math.cos(a), GEAR.y1, cz + GEAR.r * Math.sin(a)], P));
  }
  const ticks = [];
  for (let i = 0; i < 10; i++) {
    const a = -theta + (i / 10) * TAU;
    ticks.push(segment([XG + 1.6 * Math.cos(a), GEAR.y1, cz + 1.6 * Math.sin(a)], [XG + GEAR.r * Math.cos(a), GEAR.y1, cz + GEAR.r * Math.sin(a)], P));
  }
  return lineSvg(ribs.join(""), { tone: "lo" }) + lineSvg(ticks.join(""), { tone: "mid" });
}
function idlerMarks(theta) {
  const cz = TIP0 + ZG;
  const spokes = [];
  for (let i = 0; i < 3; i++) {
    const a = theta + (i / 3) * TAU;
    spokes.push(segment([IDLER.x + 1.3 * Math.cos(a), 3, cz + 1.3 * Math.sin(a)], [IDLER.x + 3.6 * Math.cos(a), 3, cz + 3.6 * Math.sin(a)], P));
  }
  return lineSvg(spokes.join(""), { tone: "lo" });
}
function fanBlades(angle) {
  const cz = TIP0 + FAN.z;
  const x = FAN.x1;
  const at = (r, a) => iso([x, r * Math.cos(a), cz + r * Math.sin(a)], P);
  const out = [];
  const count = 7;
  for (let i = 0; i < count; i++) {
    const a0 = angle + (i / count) * TAU;
    const lead = [];
    const trail = [];
    for (let j = 0; j <= 7; j++) {
      const t = j / 7;
      const r = 4.4 + (13.2 - 4.4) * t;
      const sweep = 0.9 * Math.pow(t, 1.3);
      lead.push(at(r, a0 + sweep));
      trail.push(at(r, a0 + sweep + 0.42 * (1 - 0.35 * t)));
    }
    const d = pathOf([...lead, ...trail.reverse()], true);
    out.push('<path class="iso-top" d="' + d + '"/><path class="iso-line" data-tone="lo" d="' + d + '"/>');
  }
  return out.join("");
}
function spoolHoles(angle) {
  const x = DATA.face.spool;
  const holes = [];
  for (let i = 0; i < 5; i++) {
    const a = angle + (i * TAU) / 5;
    holes.push(sideRing([x, SPOOL.y + 23 * Math.cos(a), SPOOL.z + 23 * Math.sin(a)], 6.6, "x", P, 22));
  }
  return lineSvg(holes.join(""), { tone: "lo" });
}
function beltTeeth(phase, z) {
  const marks = [];
  const pitch = 2.5;
  const first = Math.ceil((BELT.x + 1 - phase) / pitch);
  for (let i = first; i * pitch + phase < BELT.x + BELT.w - 1; i++) {
    const x = i * pitch + phase;
    marks.push(lineOnTop([x, BELT.y], [x, BELT.y + BELT.d], z, P));
  }
  return lineSvg(marks.join(""), { tone: "lo" });
}
function yBeltTeeth(phase) {
  const marks = [];
  const first = Math.ceil((-92 - phase) / 2.5);
  for (let i = first; i * 2.5 + phase < 92; i++) marks.push(lineOnTop([-3, i * 2.5 + phase], [3, i * 2.5 + phase], BASE_H + 1.2, P));
  return lineSvg(marks.join(""), { tone: "lo" });
}

// ---- the part on the bed
const plan = PART;
const outline = roundedPlan(plan, 6);
function clipLine(origin, dir) {
  let t0 = -1e9;
  let t1 = 1e9;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const num = ex * (origin[1] - a[1]) - ey * (origin[0] - a[0]);
    const den = ex * dir[1] - ey * dir[0];
    if (Math.abs(den) < 1e-9) { if (num < 0) return null; continue; }
    const t = -num / den;
    if (den > 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
  }
  return t0 < t1 ? [t0, t1] : null;
}
let builtLayer = -1;
function buildPrint(layer, wall) {
  if (wall < 0.05) { el["print-body"].innerHTML = ""; return; }
  const top = BED_TOP + wall;
  const out = [solidSvg(slabOf(plan, BED_TOP, wall, P, 6, 0), { tone: "hi", crease: "lo" })];
  const flip = layer % 2 ? -1 : 1;
  const dir = [1, flip];
  const lines = [];
  for (let c = -110; c <= 110; c += 4.2) {
    const origin = flip > 0 ? [c, 0] : [c, 0];
    const span = clipLine([c, 0], dir);
    if (!span) continue;
    lines.push(segment([c + dir[0] * span[0], dir[1] * span[0], top], [c + dir[0] * span[1], dir[1] * span[1], top], P));
  }
  out.push(lineSvg(lines.join(""), { tone: "faint" }));
  out.push(lineSvg(planOutline(insetPlan(plan, 0.9), top, P, 6), { tone: "faint" }));
  el["print-body"].innerHTML = out.join("");
}
function trailSvg(d, wall) {
  const z = BED_TOP + wall + 0.1;
  const length = 34;
  const steps = 34;
  const groups = 6;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const dd = d - (length * (steps - i)) / steps;
    if (dd < 0) continue;
    const [px, py] = M.pointAt(dd);
    pts.push(iso([px, py, z], P));
  }
  const out = [];
  const per = Math.max(1, Math.floor(pts.length / groups));
  for (let g = 0; g < groups; g++) {
    const from = g * per;
    const to = g === groups - 1 ? pts.length : Math.min(pts.length, (g + 1) * per + 1);
    const slice = pts.slice(from, to);
    if (slice.length < 2) continue;
    const alpha = (0.12 + 0.88 * ((g + 1) / groups) ** 1.4).toFixed(2);
    out.push('<path class="iso-line pr-bead" data-tone="lit" data-free="" style="stroke-opacity:' + alpha + '" d="' + pathOf(slice) + '"/>');
  }
  return out.join("");
}

// ---- the filament, from the spool to the top of the extruder
function route(xh, g) {
  const s = [SPOOL.x, SPOOL.y + SPOOL.core, SPOOL.z];
  const e = [xh, 0, TIP0 + g + 104];
  const c1 = [s[0], s[1], s[2] - 70];
  const c2 = [e[0], e[1], e[2] + 70];
  const pts = [];
  for (let i = 0; i <= 28; i++) {
    const t = i / 28;
    const u = 1 - t;
    const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
    pts.push(iso([0, 1, 2].map((n) => w[0] * s[n] + w[1] * c1[n] + w[2] * c2[n] + w[3] * e[n]), P));
  }
  pts.push(iso([xh + 1.8 * VX, 1.8 * VY, TIP0 + g + 104], P));
  const d = pathOf(pts);
  return '<g class="pr-filament"><path class="pr-fil-edge" d="' + d + '"/><path class="pr-fil-core" d="' + d + '"/></g>' + dotsSvg([iso(s, P)], { size: 0.7, tone: "hi" });
}

// ---- state
let dist = typeof window.__startLayer === "number" ? window.__startLayer * M.PERIMETER : M.startDistance;
let speed = 1;
let wanted = 1;
let touring = !still.matches;
let tourClock = 0;
let visible = false;
let frame = 0;
let last = 0;
let idleTimer = 0;
let fanAngle = 0;
let lastReadout = "";
let phase = "print"; // print, hold (part finished), clear (part fading out)
let phaseClock = 0;

function draw() {
  const st = M.stateAt(dist);
  if (phase !== "print") { st.layer = M.LAYERS - 1; st.wall = M.LAYER * M.LAYERS; st.nozzleZ = M.LAYER * M.LAYERS + M.LAYER; }
  const rate = phase === "print" ? M.rates(speed) : { head: 0, feed: 0, flow: 0, melt: 0 };
  const g = st.nozzleZ - M.LAYER;
  const xh = st.px;
  const yb = -st.py;
  el.head.setAttribute("transform", translateAlong(P, [xh, 0, 0]));
  el.gantry.setAttribute("transform", translateAlong(P, [0, 0, g]));
  el.bed.setAttribute("transform", translateAlong(P, [0, yb, 0]));
  if (st.layer !== builtLayer) { builtLayer = st.layer; buildPrint(st.layer, st.wall); }
  el.trail.innerHTML = trailSvg(dist, st.wall);
  const theta = st.fed / M.GEAR_R;
  el["gear-marks"].innerHTML = gearMarks(theta);
  el["idler-marks"].innerHTML = idlerMarks((theta * M.GEAR_R) / IDLER.r);
  el["spool-holes"].innerHTML = spoolHoles(-st.fed / M.SPOOL_R);
  el["fan-blades"].innerHTML = fanBlades(fanAngle);
  el.xbelt.innerHTML = beltTeeth(xh, TIP0 + DATA.BEAM_Z1 + 0.8);
  el.ybelt.innerHTML = yBeltTeeth(yb);
  el.route.innerHTML = route(xh, g);
  el.zcrest.setAttribute("transform", translateAlong(P, [0, 0, g % 2.4]));
  const share = Math.log(speed / M.SPEED.min) / Math.log(M.SPEED.max / M.SPEED.min);
  const knob = (-135 + 270 * share) * (Math.PI / 180);
  el["dial-pointer"].setAttribute("d", lineOnTop([DATA.DIAL.x, DATA.DIAL.y], [DATA.DIAL.x + 6.2 * Math.sin(knob), DATA.DIAL.y - 6.2 * Math.cos(knob)], BASE_H + 7.8, P));
  const layerText = phase !== "print" ? "DONE" : "LAYER " + (st.layer + 1) + "/" + M.LAYERS;
  if (el["lcd-layer"].textContent !== layerText) el["lcd-layer"].textContent = layerText;
  const text = phase !== "print" ? "done · " + M.LAYERS + " layers · " + (M.LAYER * M.LAYERS).toFixed(1) + " mm tall" : "L" + (st.layer + 1) + " · head " + Math.round(rate.head) + " · filament " + rate.feed.toFixed(1) + " mm/s · melt " + Math.round(rate.melt * 100) + "%";
  if (text !== lastReadout) { lastReadout = text; readout.textContent = text; }
  const valueText = "Speed " + Math.round(speed * 100) + " percent. Head " + Math.round(rate.head) + " millimetres per second, filament " + rate.feed.toFixed(1) + " millimetres per second, " + Math.round(rate.melt * 100) + " percent of the heater's melting capacity. Layer " + (st.layer + 1) + " of " + M.LAYERS + ".";
  if (stage.getAttribute("aria-valuetext") !== valueText && !(frame % 30)) { stage.setAttribute("aria-valuetext", valueText); stage.setAttribute("aria-valuenow", String(Math.round(speed * 100))); }
}

function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  frame++;
  if (touring) { tourClock += dt; wanted = M.tourSpeed(tourClock); }
  speed += (wanted - speed) * (1 - Math.exp(-dt / 0.45));
  if (Math.abs(wanted - speed) < 0.002) speed = wanted;
  if (!still.matches) {
    if (phase === "print") {
      dist += M.rates(speed).head * dt;
      fanAngle += dt * 9;
      if (M.stateAt(dist).layer >= M.LAYERS) { dist = M.LAYERS * M.PERIMETER - 1e-3; phase = "hold"; phaseClock = 0; builtLayer = -1; }
    } else {
      phaseClock += dt;
      fanAngle += dt * 9;
      if (phase === "hold" && phaseClock > 2.6) { phase = "clear"; phaseClock = 0; el["print-body"].style.opacity = "0"; el.trail.style.opacity = "0"; }
      else if (phase === "clear" && phaseClock > 0.7) {
        phase = "print"; dist = PERIM_RESET; builtLayer = -1;
        el["print-body"].style.transition = "none"; el["print-body"].style.opacity = "1"; el.trail.style.opacity = "1";
        void el["print-body"].getBoundingClientRect(); el["print-body"].style.transition = "";
      }
    }
  }
  draw();
  frame_id = visible ? requestAnimationFrame(tick) : 0;
}
const PERIM_RESET = M.PERIMETER * 0.1;
let frame_id = 0;
const run = () => { if (!frame_id && visible) { last = 0; frame_id = requestAnimationFrame(tick); } };
function steer(next) {
  touring = false;
  wanted = clampTo(next, M.SPEED.min, M.SPEED.max);
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { touring = !still.matches; tourClock = 0; run(); }, 3600);
  run();
}
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); else { cancelAnimationFrame(frame_id); frame_id = 0; } }, { rootMargin: "120px 0px" }).observe(stage);
stage.addEventListener("pointermove", (event) => {
  const box = svgEl.getBoundingClientRect();
  const share = clampTo(((event.clientX - box.left) / box.width - 0.12) / 0.76, 0, 1);
  if (still.matches) { dist = Math.floor(dist / M.PERIMETER) * M.PERIMETER + share * M.PERIMETER; draw(); return; }
  steer(M.overrideFromShare(share));
});
stage.addEventListener("keydown", (event) => {
  let to = null;
  if (event.key === "ArrowRight" || event.key === "ArrowUp") to = wanted * 1.25;
  if (event.key === "ArrowLeft" || event.key === "ArrowDown") to = wanted / 1.25;
  if (event.key === "Home") to = M.SPEED.min;
  if (event.key === "End") to = M.SPEED.max;
  if (event.key === "Escape") to = 1;
  if (to === null) return;
  event.preventDefault();
  steer(to);
});
if (still.matches) touring = false;
draw();
`;

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "A desktop 3D printer printing a square part. The bed slides front to back on two rails, the print head slides left to right along a beam, and the beam climbs the towers one layer at a time. Filament runs from a spool on top of the frame to the extruder, where a gear pushes it into a heated block and out through a 0.4 millimetre nozzle. The hot end is shown cut open.",
  body: defsAndBody,
});

const css = `<style>
.iso{--pr-bore:#060606}
.iso[data-theme="light"]{--pr-bore:#c9c9c4}
.pr-bore{fill:var(--pr-bore);stroke:none}
.iso{--pr-fil-edge:#ffffff;--pr-fil-core:#b9b9b9}
.iso[data-theme="light"]{--pr-fil-edge:#000000;--pr-fil-core:#5a5a5a}
.pr-fil-edge{fill:none;stroke:var(--pr-fil-edge);stroke-width:3.1;stroke-linecap:round;stroke-linejoin:round}
.pr-fil-core{fill:none;stroke:var(--pr-fil-core);stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
.pr-solid{fill:var(--anatomy-lit);fill-opacity:.9;stroke:none}
.pr-melt{fill:var(--anatomy-lit);fill-opacity:.42;stroke:none}
.pr-flow{stroke-dasharray:1.1 2.2;stroke-width:.9}
[data-part="print-body"],[data-part="trail"]{transition:opacity .6s ease}
.pr-bead{stroke-width:1.5}
.iso{--pr-screen:#0d0f0d;--pr-screen-text:#c9dcc9}
.pr-screen{fill:var(--pr-screen);stroke:none}
.pr-lcd-text{fill:var(--pr-screen-text);font-family:var(--anatomy-mono);letter-spacing:.02em}
.iso-stage{outline:none}
@media (max-width:560px){.iso-plate{overflow:hidden}.iso-stage .iso-svg{width:122%;max-width:none;margin-left:-11%;margin-top:-4%;margin-bottom:-4%}}
.iso-stage:focus-visible{outline:1px solid var(--anatomy-muted);outline-offset:6px}
</style>`;

const body = k.plateHtml({
  fig: "Fig 1",
  title: "3D printer",
  hint: "Hover to turn the speed dial",
  readout: "L9 · head 60 · filament 2.0 mm/s · melt 33%",
  keys: [
    { mark: "lit", label: "Filament: spool, gear, melt zone, bead" },
    { mark: "raised", label: "Hot end, cut open along the nozzle axis" },
  ],
  caption:
    "A bed-slinger printing a 64 mm square at 0.2 mm layers. The bed slides in Y, the head in X, and the beam climbs a layer at a time. The gear feeds 1.75 mm filament at about a thirtieth of the head's speed; the heater block melts it and the 0.4 mm nozzle lays it down as a 0.45 mm line. Hover to turn the speed dial: at 300 % the block is melting 98 % of what it can. Filament and nozzle are drawn about 1.4 times true size.",
  body: `<div class="iso-stage" tabindex="0" role="slider" aria-label="3D printer: arrow keys change the print speed" aria-valuemin="20" aria-valuemax="300" aria-valuenow="100">${svg}</div>`,
});
writeFileSync(OUT, k.pageHtml({ title: "3D printer", theme, body: css + body, script: kitScript() + live }));
console.log("wrote", OUT);
