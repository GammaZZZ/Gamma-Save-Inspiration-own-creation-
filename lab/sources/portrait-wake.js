export const GLYPHS = {
  Classic: ['·', ':', '-', '=', '+', '*', '#', '%', '@'],
  Blocks: ['·', '░', '▒', '▓', '█'],
  Dots: ['·', '•', '▪', '●'],
  Binary: ['·', '.', ':', '0', '1'],
};

export const DEFAULT_SETTINGS = Object.freeze({
  size: 4.5,
  weight: 92,
  contrast: 116,
  brightness: 0,
  background: 0,
  zoom: 91,
  glyphs: 'Classic',
  reach: 79,
  trail: 1.25,
  pull: 30,
  intensity: 87,
  flicker: 24,
  ripple: true,
  strength: 74,
  duration: 2.15,
  band: 32,
  theme: 'Paper',
  guides: false,
});

export const PALETTES = {
  Paper: { background: '#eaeae4', ink: '#20231e', grid: '#d2d3ca', lightInk: false },
  Night: { background: '#20231f', ink: '#eef0e4', grid: '#383c34', lightInk: true },
};

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const unit = (v) => clamp(v, 0, 1);
const smooth = (v) => {
  const t = unit(v);
  return t * t * (3 - 2 * t);
};

function noise(index, tick) {
  const value = (index * 374761393 + tick * 668265263) | 0;
  const mixed = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((mixed ^ (mixed >>> 16)) >>> 0) / 4294967296;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The portrait image could not be opened.'));
    image.src = src;
  });
}

function pixelsOf(image, width, height) {
  const buffer = document.createElement('canvas');
  buffer.width = width;
  buffer.height = height;
  const context = buffer.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  const grayscale = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < grayscale.length; i++, p += 4) {
    grayscale[i] = Math.round(pixels[p] * 0.2126 + pixels[p + 1] * 0.7152 + pixels[p + 2] * 0.0722);
  }
  return grayscale;
}

/** Mount a portrait renderer on an existing canvas. Serve external images from the same origin. */
export function createPortraitWake(canvas, { image, matte, settings: initial = {}, onManualInput } = {}) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const settings = { ...DEFAULT_SETTINGS, ...initial };
  const controller = new AbortController();
  const pointer = { x: 0, y: 0, level: 0, present: false, previous: null };
  const toneKeys = ['size', 'weight', 'contrast', 'brightness', 'background', 'zoom', 'theme'];
  let source = null;
  let width = 0, height = 0, ratio = 1;
  let rect = null;
  let points = [], stepX = 0, stepY = 0, cols = 0, rows = 0, gridX = 0, gridY = 0;
  let original = false, destroyed = false, touchId = null;
  let lastTime = 0, shimmerTime = 0, tick = 0, frame = 0, hadHeat = false;
  let rings = [];
  let demo = null;

  function buildGrid() {
    if (!source || width < 2 || height < 2) return;
    const scale = Math.min(width / source.width, height / source.height) * (settings.zoom / 100);
    const w = source.width * scale;
    const h = source.height * scale;
    rect = { x: (width - w) / 2, y: (height - h) / 2, w, h };
    stepX = Math.max(2.25, settings.size * Math.min(1, width / 610));
    stepY = stepX * Math.sqrt(3) / 2;
    gridX = rect.x + (rect.w % stepX) / 2;
    gridY = rect.y + (rect.h % stepY) / 2;
    cols = Math.floor(rect.w / stepX);
    rows = Math.floor(rect.h / stepY);
    points = new Array(cols * rows);
    const palette = PALETTES[settings.theme] ?? PALETTES.Paper;
    const sampleOffset = Math.min(
      Math.floor((Math.min(source.width, source.height) - 1) / 2),
      Math.max(1, Math.floor(stepX / scale / 4)),
    );
    const data = source.photo;

    for (let row = 0; row < rows; row++) {
      const y = gridY + (row + 0.5) * stepY;
      const v = unit((y - rect.y) / rect.h);
      const py = Math.floor(v * (source.height - 1));
      for (let col = 0; col < cols; col++) {
        const x = gridX + (col + 0.25 + (row & 1) * 0.5) * stepX;
        const u = unit((x - rect.x) / rect.w);
        const px = Math.floor(u * (source.width - 1));
        const pixel = py * source.width + px;
        const sampleX = clamp(px, sampleOffset, source.width - 1 - sampleOffset);
        const sampleY = clamp(py, sampleOffset, source.height - 1 - sampleOffset);
        const top = (sampleY - sampleOffset) * source.width + sampleX;
        const bottom = (sampleY + sampleOffset) * source.width + sampleX;
        const light = (data[top - sampleOffset] + data[top + sampleOffset]
          + data[bottom - sampleOffset] + data[bottom + sampleOffset]) / (4 * 255);
        const adjusted = unit((light - 0.5) * settings.contrast / 100 + 0.5 + settings.brightness / 100);
        const mask = source.matte ? source.matte[pixel] / 255 : 1;
        const edge = smooth(Math.min(u, 1 - u) / 0.045) * smooth(Math.min(v, (1 - v) * 0.49) / 0.032);
        const coverage = edge * (mask + (1 - mask) * settings.background / 100);
        const shade = palette.lightInk ? adjusted : 1 - adjusted;
        const radius = stepX * 0.475 * settings.weight / 100 * Math.sqrt(Math.pow(shade, 1.22) * coverage);
        points[row * cols + col] = { x, y, shade, coverage, radius, heat: 0 };
      }
    }
    pointer.previous = null;
    hadHeat = false;
  }

  function paint() {
    if (width < 2 || height < 2) return;
    const palette = PALETTES[settings.theme] ?? PALETTES.Paper;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 0, canvas.width / ratio, canvas.height / ratio);
    if (!source || !rect) return;
    if (original) {
      ctx.drawImage(source.image, rect.x, rect.y, rect.w, rect.h);
      return;
    }
    if (settings.guides) {
      ctx.beginPath();
      for (let x = width / 2 % 24; x < width; x += 24) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let y = height / 2 % 24; y < height; y += 24) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.lineWidth = 1;
      ctx.strokeStyle = palette.grid;
      ctx.stroke();
    }

    const glyphs = GLYPHS[settings.glyphs] ?? GLYPHS.Classic;
    const reach = settings.reach;
    const intensity = settings.intensity / 100;
    const maxDistance = reach * 1.75;
    const pull = settings.pull / 100 * pointer.level;
    const ringWidth = settings.band;
    const waveMax = Math.hypot(width, height) * 0.66;
    ctx.fillStyle = palette.ink;
    ctx.font = `600 ${stepX * 1.55}px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.beginPath();
    let hasGlyphs = false;

    for (let index = 0; index < points.length; index++) {
      const pt = points[index];
      if (pt.coverage < 0.025) continue;
      let x = pt.x, y = pt.y;
      let heat = pt.heat;
      if (pointer.level > 0.004) {
        const dx = pointer.x - x, dy = pointer.y - y;
        const distance2 = dx * dx + dy * dy;
        const proximity = unit(1 - distance2 / (reach * reach));
        heat = Math.max(heat, pointer.level * proximity * proximity);
        if (pull > 0 && distance2 > 0 && distance2 < maxDistance * maxDistance) {
          const distance = Math.sqrt(distance2);
          const falloff = 1 - distance / maxDistance;
          const amount = Math.min(distance * 0.4, pull * reach * 0.22 * falloff * falloff);
          x += dx / distance * amount;
          y += dy / distance * amount;
        }
      }
      let wave = 0;
      for (const ring of rings) {
        const life = ring.age / ring.duration;
        const radius = 3 + (1 - (1 - life) ** 2.25) * waveMax;
        const distance = (Math.hypot(pt.x - ring.x, pt.y - ring.y) - radius) / ringWidth;
        if (Math.abs(distance) < 2.3) {
          wave += Math.exp(-distance * distance * 2) * (1 - life) ** 1.45 * settings.strength / 100;
        }
      }
      const warm = unit((heat * intensity + wave) * (0.9 + pt.shade * 0.1));
      let radius = pt.radius;
      if (warm * Math.sqrt(pt.coverage) > 0.13) {
        const blend = smooth((warm * Math.sqrt(pt.coverage) - 0.13) / 0.22);
        const shimmer = (noise(index, tick) - 0.5) * settings.flicker / 100 * warm * 3;
        const tier = clamp(Math.floor(warm * 1.26 * glyphs.length + shimmer), 0, glyphs.length - 1);
        ctx.globalAlpha = blend * (0.56 + pt.shade * 0.44) * Math.sqrt(pt.coverage);
        ctx.fillText(glyphs[tier], x, y + stepX * 0.065);
        hasGlyphs = true;
        // Leave some of the original shadow under the characters.
        radius *= 1 - blend * (0.68 - pt.shade * 0.42);
      }
      if (radius > 0.14) {
        ctx.moveTo(x + radius, y);
        ctx.arc(x, y, radius, 0, Math.PI * 2);
      }
    }
    ctx.globalAlpha = 1;
    ctx.fill();
    return hasGlyphs;
  }

  function stamp(x, y) {
    const radius = settings.reach;
    const firstCol = Math.max(0, Math.floor((x - radius - gridX) / stepX) - 1);
    const lastCol = Math.min(cols - 1, Math.ceil((x + radius - gridX) / stepX));
    const firstRow = Math.max(0, Math.floor((y - radius - gridY) / stepY));
    const lastRow = Math.min(rows - 1, Math.ceil((y + radius - gridY) / stepY));
    for (let row = firstRow; row <= lastRow; row++) {
      for (let col = firstCol; col <= lastCol; col++) {
        const pt = points[row * cols + col];
        if (pt.coverage < 0.025) continue;
        const distance2 = (pt.x - x) ** 2 + (pt.y - y) ** 2;
        if (distance2 >= radius * radius) continue;
        const falloff = 1 - distance2 / (radius * radius);
        pt.heat = unit(pt.heat + 0.73 * falloff * falloff);
        hadHeat = true;
      }
    }
  }

  function move(x, y) {
    const from = pointer.previous ?? { x, y };
    const dx = x - from.x, dy = y - from.y;
    if (rect) {
      const count = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (settings.reach * 0.24)));
      for (let i = 1; i <= count; i++) stamp(from.x + dx * i / count, from.y + dy * i / count);
    }
    pointer.x = x;
    pointer.y = y;
    pointer.present = true;
    pointer.previous = { x, y };
    run();
  }

  function leave() {
    pointer.previous = null;
    pointer.present = false;
    run();
  }

  function ripple(x, y) {
    if (!settings.ripple || original) return;
    if (rings.length >= 5) rings.shift();
    rings.push({ x, y, age: 0, duration: settings.duration });
    run();
  }

  function advanceDemo(dt) {
    if (!demo || !rect) return;
    demo.time += dt;
    const a = demo.time * 0.93 - 2.2;
    const x = rect.x + rect.w * (0.5 + Math.cos(a) * 0.26);
    const y = rect.y + rect.h * (0.52 + Math.sin(a * 1.8 + 0.6) * 0.27);
    move(x, y);
    const burst = Math.floor((demo.time + 1) / 5);
    if (burst > demo.burst) {
      ripple(x, y);
      demo.burst = burst;
    }
  }

  function animate(time) {
    const dt = Math.min(0.05, (time - lastTime) / 1000);
    lastTime = time;
    advanceDemo(dt);
    if (hadHeat) {
      const keep = Math.exp(-dt * 3 / settings.trail);
      hadHeat = false;
      for (const point of points) {
        const next = point.heat * keep;
        point.heat = next < 0.016 ? 0 : next;
        if (point.heat > 0) hadHeat = true;
      }
    }
    rings = rings.filter((ring) => (ring.age += dt) < ring.duration);
    const target = pointer.present ? 1 : 0;
    pointer.level += (target - pointer.level) * (1 - Math.exp(-dt * 13));
    shimmerTime += dt;
    if (shimmerTime >= 0.075) {
      shimmerTime %= 0.075;
      tick++;
    }
    const hasGlyphs = paint();
    const settling = Math.abs(target - pointer.level) > 0.004;
    const shimmering = hasGlyphs && target && settings.flicker > 0;
    frame = demo || hadHeat || rings.length || settling || shimmering ? requestAnimationFrame(animate) : 0;
  }

  function run() {
    if (frame || original || destroyed) return;
    lastTime = performance.now();
    frame = requestAnimationFrame(animate);
  }

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    const nextRatio = Math.min(2, window.devicePixelRatio || 1);
    if (bounds.width < 2 || bounds.height < 2) return;
    if (bounds.width === width && bounds.height === height && nextRatio === ratio) return;
    width = bounds.width;
    height = bounds.height;
    ratio = nextRatio;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    buildGrid();
    paint();
  }

  function stopDemo() {
    if (!demo) return;
    demo = null;
    leave();
  }

  function locate(event) {
    const bounds = canvas.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  function input(event) {
    if (original || (event.pointerType !== 'mouse' && touchId !== event.pointerId)) return;
    if (demo) {
      stopDemo();
      onManualInput?.();
    }
    const { x, y } = locate(event);
    move(x, y);
  }

  function press(event) {
    if (original || !event.isPrimary || event.button !== 0) return;
    if (event.pointerType !== 'mouse') {
      touchId = event.pointerId;
      canvas.setPointerCapture(event.pointerId);
    }
    input(event);
    const { x, y } = locate(event);
    ripple(x, y);
  }

  function release(event) {
    if (event.pointerId !== touchId) return;
    touchId = null;
    leave();
  }

  function keyboard(event) {
    if (original) return;
    const arrows = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    const direction = arrows[event.key];
    if (!direction && event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (demo) {
      stopDemo();
      onManualInput?.();
    }
    const x = pointer.present ? pointer.x : width / 2;
    const y = pointer.present ? pointer.y : height / 2;
    if (direction) move(clamp(x + direction[0] * 23, 0, width), clamp(y + direction[1] * 23, 0, height));
    else ripple(x, y);
  }

  const listeners = {
    pointerenter: input, pointermove: input, pointerdown: press,
    pointerleave: (event) => { if (event.pointerType === 'mouse') leave(); },
    pointerup: release, pointercancel: release, lostpointercapture: release,
    keydown: keyboard, blur: leave,
  };
  for (const [name, callback] of Object.entries(listeners)) {
    canvas.addEventListener(name, callback, { signal: controller.signal });
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  const ready = Promise.all([loadImage(image), matte ? loadImage(matte) : null]).then(([photo, mask]) => {
    if (destroyed) return;
    const w = photo.naturalWidth, h = photo.naturalHeight;
    source = {
      image: photo, width: w, height: h,
      photo: pixelsOf(photo, w, h), matte: mask ? pixelsOf(mask, w, h) : null,
    };
    buildGrid();
    paint();
  });

  return {
    ready,
    setSettings(next) {
      const rebuild = toneKeys.some((key) => key in next && settings[key] !== next[key]);
      Object.assign(settings, next);
      if (rebuild) buildGrid();
      if (!settings.ripple) rings = [];
      paint();
      if (pointer.present) run();
    },
    setOriginal(show) {
      original = show;
      if (original) {
        stopDemo();
        cancelAnimationFrame(frame);
        frame = 0;
        pointer.present = false;
        pointer.previous = null;
        pointer.level = 0;
        rings = [];
        for (const point of points) point.heat = 0;
        hadHeat = false;
      }
      paint();
    },
    playDemo() {
      if (original || !source || demo) return;
      pointer.previous = null;
      demo = { time: 0, burst: 0 };
      run();
    },
    stopDemo,
    clear() {
      stopDemo();
      rings = [];
      pointer.present = false;
      pointer.previous = null;
      pointer.level = 0;
      for (const point of points) point.heat = 0;
      hadHeat = false;
      paint();
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frame);
      controller.abort();
      observer.disconnect();
    },
  };
}
