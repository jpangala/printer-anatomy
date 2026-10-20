// rig.mjs: the model behind the figure. Pure functions, millimetres and seconds.
// Every number the page shows (head speed, filament feed, melt load, layer, z) comes from here,
// and the same module places the head, the bed, the gantry, the gear and the spool.

export const FILAMENT_D = 1.75; // mm
export const NOZZLE_D = 0.4; // mm
export const LAYER = 0.2; // mm
export const LINE_W = 0.45; // mm
export const V100 = 60; // head speed at 100 %, mm/s
export const MELT_LIMIT = 15; // mm^3/s a 40 W heater block can melt
export const NOZZLE_T = 215; // deg C, PLA
export const GEAR_R = 3.5; // effective radius of the drive gear, mm (7 mm pitch diameter)
export const SPOOL_R = 30; // mean winding radius, mm
export const PART = { half: 32, r: 6 }; // 64 mm square, 6 mm corners
export const LAYERS = 50; // the job: 50 layers = 10 mm
export const START_LAYER = 8;
export const SPEED = { min: 0.2, max: 3 };

export const AREA_FILAMENT = Math.PI * (FILAMENT_D / 2) ** 2; // 2.405 mm^2
export const AREA_BEAD = (LINE_W - LAYER) * LAYER + Math.PI * (LAYER / 2) ** 2; // stadium section, 0.0814 mm^2
export const FLOW_100 = AREA_BEAD * V100; // mm^3/s
export const FEED_100 = FLOW_100 / AREA_FILAMENT; // mm/s of filament

// ---- the path: a rounded square, counter-clockwise from the middle of the near-bottom edge
const { half: H, r: R } = PART;
const STRAIGHT = 2 * (H - R);
const ARC = (Math.PI * R) / 2;
const SEGMENTS = (() => {
  const out = [];
  const line = (a, b) => out.push({ kind: "line", a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1]) });
  const arc = (c, a0) => out.push({ kind: "arc", c, a0, len: ARC });
  line([0, -H], [H - R, -H]);
  arc([H - R, -H + R], -Math.PI / 2);
  line([H, -H + R], [H, H - R]);
  arc([H - R, H - R], 0);
  line([H - R, H], [-H + R, H]);
  arc([-H + R, H - R], Math.PI / 2);
  line([-H, H - R], [-H, -H + R]);
  arc([-H + R, -H + R], Math.PI);
  line([-H + R, -H], [0, -H]);
  return out;
})();
export const PERIMETER = SEGMENTS.reduce((sum, segment) => sum + segment.len, 0);

export function pointAt(u) {
  let rest = ((u % PERIMETER) + PERIMETER) % PERIMETER;
  for (const segment of SEGMENTS) {
    if (rest <= segment.len) {
      const t = rest / segment.len;
      if (segment.kind === "line") return [segment.a[0] + (segment.b[0] - segment.a[0]) * t, segment.a[1] + (segment.b[1] - segment.a[1]) * t];
      const angle = segment.a0 + t * (Math.PI / 2);
      return [segment.c[0] + R * Math.cos(angle), segment.c[1] + R * Math.sin(angle)];
    }
    rest -= segment.len;
  }
  return [0, -H];
}

// the job as a function of distance printed, d (mm of path)
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
export function stateAt(d) {
  const layer = Math.floor(d / PERIMETER);
  const u = d - layer * PERIMETER;
  const [px, py] = pointAt(u);
  const lift = LAYER * smooth((u - (PERIMETER - 6)) / 6); // the layer step happens as the loop closes
  return {
    layer, // 0-based index of the layer being printed
    u,
    px, // nozzle in part coordinates: x is the head, y is the bed (bed moves -y)
    py,
    wall: LAYER * layer, // height of the part under the nozzle, mm
    nozzleZ: LAYER * (layer + 1) + lift, // tip above the sheet, mm
    fed: (AREA_BEAD * d) / AREA_FILAMENT, // mm of filament pushed through the gear so far
  };
}

export const rates = (override) => {
  const head = V100 * override;
  const flow = AREA_BEAD * head;
  return { head, flow, feed: flow / AREA_FILAMENT, melt: flow / MELT_LIMIT, gearRpm: (flow / AREA_FILAMENT / (2 * Math.PI * GEAR_R)) * 60 };
};

export const startDistance = START_LAYER * PERIMETER + PERIMETER * 0.12;

// the idle tour: a slow speed dial turned up and down, like a hand on the printer's speed knob
export function tourSpeed(t) {
  const phases = [
    [6, 1.0],
    [5, 2.0],
    [5, 3.0],
    [6, 0.45],
    [5, 1.0],
  ];
  const total = phases.reduce((sum, [length]) => sum + length, 0);
  let rest = t % total;
  let index = 0;
  for (; index < phases.length; index++) {
    if (rest < phases[index][0]) break;
    rest -= phases[index][0];
  }
  return phases[index][1];
}

export const overrideFromShare = (share) => SPEED.min * Math.pow(SPEED.max / SPEED.min, Math.min(1, Math.max(0, share)));
