export const PALETTES = {
  orange: ['#f22f06', '#ff8608', '#ffd27b'],
  blue: ['#123da8', '#1b8cff', '#b6f5ff'],
  green: ['#05634c', '#21b777', '#d3f79a'],
  purple: ['#5123a4', '#ac57e8', '#f4ccff'],
};

export const DEFAULTS = {
  mode: 'jelly',
  colors: PALETTES.orange,
  speed: 0.65,
  playing: true,
  size: 360,
};

const resolution = 232;
const colorSteps = 512;
const frameInterval = 1000 / 30;
const modes = ['wave', 'jelly', 'bloom'];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smooth = (low, high, value) => {
  const t = clamp((value - low) / (high - low), 0, 1);
  return t * t * (3 - 2 * t);
};

function colorRamp(colors) {
  const stops = colors.map(color => [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16)));
  const ramp = new Uint8ClampedArray(colorSteps * 4);
  for (let i = 0; i < colorSteps; i++) {
    const t = i / (colorSteps - 1);
    const segment = t < 0.52 ? 0 : 1;
    const mix = segment === 0 ? t / 0.52 : (t - 0.52) / 0.48;
    for (let channel = 0; channel < 3; channel++) {
      const from = stops[segment][channel];
      ramp[i * 4 + channel] = from + (stops[segment + 1][channel] - from) * mix;
    }
    ramp[i * 4 + 3] = 255;
  }
  return new Uint32Array(ramp.buffer);
}

// The glasses use the coordinates of the supplied reference. They're redrawn only on resize.
function drawGlasses(canvas, size) {
  const pixels = Math.max(1, Math.round(size * Math.min(window.devicePixelRatio || 1, 3)));
  if (canvas.width === pixels && canvas.height === pixels) return;
  canvas.width = canvas.height = pixels;
  const ctx = canvas.getContext('2d');
  const scale = pixels / 520;
  ctx.setTransform(scale, 0, 0, scale, -144 * scale, -172 * scale);

  const frame = new Path2D('M 153 420 C 162 391 237 365 310 357 C 349 352 371 351 389 355 C 408 359 423 357 446 346 C 488 326 565 305 608 309 C 625 309 631 315 630 324 C 629 332 623 335 613 337 C 601 341 598 351 595 371 C 589 406 578 424 546 433 C 520 440 490 442 473 433 C 458 425 452 415 444 396 C 438 383 434 379 426 381 C 416 382 413 389 410 400 C 405 427 395 446 369 457 C 343 468 308 471 290 462 C 272 453 261 439 251 416 C 244 400 235 398 216 403 C 194 407 180 416 169 432 C 161 443 149 438 153 420 Z');
  const leftLens = new Path2D('M 254 383 C 274 370 325 360 358 361 C 387 361 404 369 401 394 C 398 422 386 441 360 450 C 336 459 310 462 292 452 C 270 439 248 402 254 383 Z');
  const rightLens = new Path2D('M 451 361 C 477 343 534 324 570 322 C 588 321 596 328 592 349 C 587 381 583 406 557 420 C 534 433 497 437 479 428 C 461 420 446 381 451 361 Z');

  const rim = ctx.createLinearGradient(340, 311, 365, 460);
  rim.addColorStop(0, '#292624');
  rim.addColorStop(0.48, '#191817');
  rim.addColorStop(1, '#100f10');
  ctx.fillStyle = rim;
  ctx.fill(frame);

  const lens = ctx.createLinearGradient(369, 320, 395, 455);
  lens.addColorStop(0, '#292626');
  lens.addColorStop(0.46, '#1d1b1d');
  lens.addColorStop(1, '#171617');
  ctx.fillStyle = lens;
  ctx.strokeStyle = 'rgba(255, 225, 202, 0.14)';
  ctx.lineWidth = 1.55;
  ctx.fill(leftLens);
  ctx.stroke(leftLens);
  ctx.fill(rightLens);
  ctx.stroke(rightLens);
}

function orbField() {
  const coordinates = Float32Array.from({ length: resolution }, (_, i) => (i + 0.5) / resolution * 2 - 1);
  const light = new Float32Array(resolution * resolution);
  const rim = new Float32Array(light.length);
  let index = 0;
  for (const y of coordinates) {
    for (const x of coordinates) {
      const radius = Math.hypot(x, y);
      const softbox = Math.exp(-((x + 0.58) ** 2 / 0.14 + (y + 0.65) ** 2 / 0.28));
      const bounce = Math.exp(-((x - 0.47) ** 2 / 0.34 + (y - 0.93) ** 2 / 0.07));
      const grazing = smooth(0.53, 1, radius) * smooth(-0.21, 1.1, -0.70 * x - 0.45 * y);
      light[index] = 0.29 * softbox + 0.25 * bounce + 0.17 * grazing;
      rim[index] = smooth(0.60, 1.13, radius) * smooth(-0.03, 1.15, x + 0.23 * y);
      index++;
    }
  }
  return { coordinates, light, rim };
}

const field = orbField();

function drawWave(pixels, ramp, time) {
  const t = time * 1.65;
  let index = 0;
  for (const y of field.coordinates) {
    for (const x of field.coordinates) {
      const swell = 0.24 * Math.sin(3.05 * x - t) + 0.10 * Math.sin(6.0 * x + 0.71 * t);
      const current = y - swell - 0.14 * x;
      const surface = smooth(-0.25, 0.22, current);
      const crest = Math.exp(-((current - 0.02) ** 2 / 0.029));
      const undertow = 0.5 + 0.5 * Math.sin(5.8 * current + 1.3 * x - 0.82 * t);
      const value = 0.17 + 0.52 * surface + 0.21 * crest + 0.14 * undertow
        + field.light[index] * 0.7 - field.rim[index] * 0.12;
      pixels[index++] = ramp[Math.round(clamp(value, 0, 1) * (colorSteps - 1))];
    }
  }
}

function drawJelly(pixels, ramp, time) {
  const t = time * 1.55;
  const tilt = 0.23 * Math.sin(0.84 * t);
  const shift = 0.21 * Math.sin(0.92 * t);
  let index = 0;
  for (const y of field.coordinates) {
    const push = 0.28 * Math.sin(2.8 * y + t);
    for (const x of field.coordinates) {
      const u = x + push - shift;
      const v = y + 0.24 * Math.sin(2.6 * x - t * 0.77) + tilt * x;
      const fold = Math.sin(2.35 * u + 1.22 * v + 0.91 * Math.sin(3.0 * v - t * 0.69));
      const pool = Math.sin(-1.8 * u + 2.7 * v + t * 0.78);
      const pearl = smooth(0.01, 1.25, -fold + 0.44 * pool);
      const value = 0.30 + 0.47 * pearl + 0.11 * pool
        + field.light[index] - 0.07 * field.rim[index];
      pixels[index++] = ramp[Math.round(clamp(value, 0, 1) * (colorSteps - 1))];
    }
  }
}

function drawBloom(pixels, ramp, time) {
  const t = time * 1.16;
  const ax = -0.38 + 0.40 * Math.sin(t * 0.63);
  const ay = 0.17 + 0.40 * Math.cos(t * 0.81);
  const bx = 0.38 + 0.44 * Math.cos(t * 0.84);
  const by = -0.35 + 0.32 * Math.sin(t * 0.72);
  const cx = 0.54 * Math.sin(t * 0.79 + 1.0);
  const cy = 0.51 * Math.sin(t * 0.62 + 2.2);
  let index = 0;
  for (const y of field.coordinates) {
    const bend = 0.22 * Math.sin(3.4 * y - t);
    for (const x of field.coordinates) {
      const u = x + bend;
      const v = y + 0.27 * Math.sin(3.7 * x + t);
      const large = Math.exp(-((u - ax) ** 2 / 0.27 + (v - ay) ** 2 / 0.34));
      const small = Math.exp(-((u - bx) ** 2 / 0.14 + (v - by) ** 2 / 0.32));
      const streak = Math.exp(-((u - cx + 0.55 * (v - cy)) ** 2 / 0.085 + (v - cy) ** 2 / 0.43));
      const glow = Math.max(0.77 * large, 0.67 * small, 0.57 * streak);
      const value = 0.09 + glow + 0.15 * large * small
        + 0.36 * field.light[index] - 0.05 * field.rim[index];
      pixels[index++] = ramp[Math.round(clamp(value, 0, 1) * (colorSteps - 1))];
    }
  }
}

const render = { wave: drawWave, jelly: drawJelly, bloom: drawBloom };

function layer(host, style) {
  const canvas = host.ownerDocument.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    ...style,
  });
  host.append(canvas);
  return canvas;
}

export function mountLiquidOrb(host, initialOptions = {}) {
  const base = { ...DEFAULTS, playing: !matchMedia('(prefers-reduced-motion: reduce)').matches };
  let options = base;
  let ramp = colorRamp(options.colors);
  let phase = 0;
  let visiblePhase = 0;
  let frame = null;
  let lastTick = null;
  let lastDraw = -Infinity;

  const fluid = layer(host, { borderRadius: '50%' });
  const glasses = layer(host, {});
  glasses.width = glasses.height = 0;
  fluid.width = fluid.height = resolution;
  const ctx = fluid.getContext('2d', { alpha: false });
  const image = ctx.createImageData(resolution, resolution);
  const pixels = new Uint32Array(image.data.buffer);

  function draw() {
    render[options.mode](pixels, ramp, phase);
    ctx.putImageData(image, 0, 0);
    visiblePhase = phase;
  }

  function tick(now) {
    if (lastTick !== null) phase += Math.min(now - lastTick, 50) * options.speed / 1000;
    lastTick = now;
    if (now - lastDraw >= frameInterval - 1) {
      draw();
      lastDraw = now;
    }
    frame = requestAnimationFrame(tick);
  }

  function setOptions(patch) {
    const next = { ...options, ...patch };
    for (const key of Object.keys(base)) {
      if (next[key] === undefined) next[key] = base[key];
    }
    next.mode = modes.includes(next.mode) ? next.mode : base.mode;
    next.speed = Number.isFinite(next.speed) ? clamp(next.speed, 0, 4) : base.speed;
    next.playing = typeof next.playing === 'boolean' ? next.playing : base.playing;
    if (!Array.isArray(next.colors) || next.colors.length !== 3 ||
        !next.colors.every(color => typeof color === 'string' && /^#[\da-f]{6}$/i.test(color))) {
      next.colors = base.colors;
    }
    const colorsChanged = next.colors.some((color, i) => color !== options.colors[i]);
    const redraw = colorsChanged || next.mode !== options.mode;
    if (colorsChanged) ramp = colorRamp(next.colors);
    options = { ...next, colors: [...next.colors] };

    const moving = options.playing && options.speed > 0;
    if (moving && frame === null) {
      lastTick = null;
      frame = requestAnimationFrame(tick);
    }
    if (!moving && frame !== null) {
      cancelAnimationFrame(frame);
      frame = null;
      lastTick = null;
      phase = visiblePhase;
    }
    if (redraw) draw();
  }

  const sizeObserver = new ResizeObserver(([entry]) => drawGlasses(glasses, entry.contentRect.width));
  sizeObserver.observe(host);
  setOptions(initialOptions);
  draw();

  return {
    setOptions,
    destroy() {
      if (frame !== null) cancelAnimationFrame(frame);
      sizeObserver.disconnect();
      fluid.remove();
      glasses.remove();
    },
  };
}
