import { useEffect, useRef } from "react"
import type { CSSProperties } from "react"

export type GradientEffect = "mesh" | "radial" | "linear" | "flow" | "silk" | "conic" | "reflected"
export type GradientTexture = "none" | "grain" | "paper" | "fluted" | "scanline" | "grid" | "dots" | "hatch" | "moire"
export type GradientBlend = "source-over" | "screen" | "multiply" | "soft-light" | "overlay" | "lighter"
export type GradientLayer = {
  id: string
  name: string
  effect: GradientEffect
  texture: GradientTexture
  blend: GradientBlend
  colors: string[]
  x: number
  y: number
  width: number
  height: number
  angle: number
  opacity: number
  softness: number
  warp: number
  strength: number
  scale: number
  seed: number
  visible: boolean
}
export type GradientConfig = { base: string; layers: GradientLayer[] }

type RGB = [number, number, number]
type CacheEntry = { key: string; canvas: HTMLCanvasElement }
const layerCache = new WeakMap<HTMLCanvasElement, Map<string, CacheEntry>>()
const tau = Math.PI * 2

function limit(value: number) {
  return Math.min(1, Math.max(0, value))
}

function ease(value: number) {
  return value * value * (3 - 2 * value)
}

function fract(value: number) {
  return value - Math.floor(value)
}

function rgb(hex: string): RGB {
  const digits = hex.slice(1)
  const value = parseInt(digits.length === 3 ? digits.split("").map(digit => digit + digit).join("") : digits, 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

function hash(x: number, y: number, seed: number) {
  let n = Math.imul(x + 101, 374761393) ^ Math.imul(y + 29, 668265263) ^ Math.imul(seed + 7, 1442695041)
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}

function textureAt(kind: GradientTexture, u: number, v: number, x: number, y: number, scale: number, seed: number) {
  const a = u * 32 / scale
  const b = v * 32 / scale

  switch (kind) {
    case "grain":
      return hash(Math.floor(x / scale), Math.floor(y / scale), seed) - 0.5
    case "paper": {
      const fiberX = Math.floor(x / (1.3 * scale))
      const fiberY = Math.floor(y / (3.6 * scale))
      return (hash(fiberX, fiberY, seed) - 0.5) * 0.62 + (hash(x, y, seed + 1) - 0.5) * 0.38
    }
    case "fluted":
      return Math.pow(Math.max(0, Math.cos(a * tau)), 12) * 0.63 - Math.sin(a * tau) * 0.22 - 0.1
    case "scanline":
      return Math.pow(Math.max(0, Math.cos(b * tau)), 9) - 0.27
    case "grid":
      return (Math.abs(fract(a + 0.5) - 0.5) < 0.036 || Math.abs(fract(b + 0.5) - 0.5) < 0.036) ? 0.56 : -0.055
    case "dots": {
      const dx = fract(a + 0.5) - 0.5
      const dy = fract(b + 0.5) - 0.5
      return (dx * dx + dy * dy < 0.031) ? 0.66 : -0.07
    }
    case "hatch":
      return Math.pow(Math.max(0, Math.cos((a + b) * tau)), 11) * 0.58
        + Math.pow(Math.max(0, Math.cos((a - b) * tau)), 11) * 0.43 - 0.18
    case "moire":
      return (Math.sin((a + 0.07 * b) * tau) + Math.sin((a - 0.11 * b + 0.33 * Math.sin(b * 0.19)) * tau)) * 0.34
    default:
      return 0
  }
}

function rasterLayer(canvas: HTMLCanvasElement, layer: GradientLayer) {
  const ctx = canvas.getContext("2d")
  if (!ctx) return

  const width = canvas.width
  const height = canvas.height
  const frame = ctx.createImageData(width, height)
  const pixels = frame.data
  const colors = layer.colors.map(rgb)
  const stops = colors.length - 1
  const radians = layer.angle * Math.PI / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const radiusX = Math.max(0.025, layer.width / 200)
  const radiusY = Math.max(0.025, layer.height / 200)
  const feather = Math.max(0.035, layer.softness / 100)
  const warp = layer.warp / 100
  const phase = layer.seed * 0.019
  const textured = layer.texture !== "none" && layer.strength > 0
  const strength = layer.strength * (layer.texture === "grain" || layer.texture === "paper" ? 0.88 : 1.16)
  const scale = Math.max(0.25, layer.scale / 100)
  const centerX = layer.x / 100
  const centerY = layer.y / 100
  const aspect = width / height
  const meshPoints = colors.map((_, index) => ({
    x: Math.cos(-2.5 + index * tau / colors.length + phase) * (0.51 + hash(index, 7, layer.seed) * 0.28),
    y: Math.sin(-2.5 + index * tau / colors.length + phase) * (0.46 + hash(index, 9, layer.seed) * 0.26),
  }))
  const meshFalloff = 8.1 - feather * 5.3

  for (let row = 0; row < height; row++) {
    const dy = (row + 0.5) / height - centerY
    const textureY = Math.floor((row + 0.5) * 1080 / height)
    for (let col = 0; col < width; col++) {
      const dx = (col + 0.5) / width - centerX
      const u = (dx * cos + dy * sin / aspect) / radiusX
      const v = (dy * cos - dx * sin * aspect) / radiusY
      const distance = Math.hypot(u, v)
      if (distance >= 1) continue

      const offset = (row * width + col) * 4
      const alpha = ease(limit((1 - distance) / feather))
      let red = 0
      let green = 0
      let blue = 0
      let t = 0
      let light = 0

      switch (layer.effect) {
        case "mesh": {
          const px = u + warp * Math.sin(v * 3.7 + phase) * 0.29
          const py = v + warp * Math.sin(u * 4.8 - phase) * 0.29
          let sum = 0
          for (let index = 0; index < colors.length; index++) {
            const cx = px - meshPoints[index].x
            const cy = py - meshPoints[index].y
            const influence = Math.exp(-(cx * cx + cy * cy) * meshFalloff)
            sum += influence
            red += colors[index][0] * influence
            green += colors[index][1] * influence
            blue += colors[index][2] * influence
          }
          red /= sum
          green /= sum
          blue /= sum
          break
        }
        case "radial":
          t = distance * (1.08 + 0.45 * warp)
          break
        case "linear":
          t = 0.5 + u * (0.52 + 0.4 * warp)
          break
        case "flow": {
          const bend = v + Math.sin(u * 3.2 + phase) * (0.19 + 0.58 * warp)
          t = 0.5 + bend * 0.53 + Math.sin(u * 5.5 - bend * 4.4) * warp * 0.16
          break
        }
        case "silk": {
          const fold = v + Math.sin(u * 3.6 + phase) * (0.14 + warp * 0.34) + Math.sin(u * 7.1 + v * 3.6) * warp * 0.11
          t = 0.5 + Math.sin(fold * (3.6 + warp * 3.1) + u * 1.36) * 0.40
          const crease = Math.max(0, Math.cos(fold * 9.1 - u * 2.15 + phase))
          light = Math.pow(crease, 8.5) * (20 + warp * 32) - 7
          break
        }
        case "conic":
          t = fract(Math.atan2(v, u) / tau + 0.5 + distance * warp * 0.44)
          break
        case "reflected":
          t = Math.abs(v + Math.sin(u * 2.4 + phase) * warp * 0.32) * 1.3
          break
      }

      if (layer.effect !== "mesh" && stops === 0) {
        [red, green, blue] = colors[0]
      } else if (layer.effect !== "mesh") {
        const loop = layer.effect === "conic"
        const stop = limit(t) * (loop ? colors.length : stops)
        const index = Math.min(loop ? stops : stops - 1, Math.floor(stop))
        const next = (index + 1) % colors.length
        const f = stop - index
        const mix = f + (ease(f) - f) * (0.25 + 0.65 * feather)
        red = colors[index][0] + (colors[next][0] - colors[index][0]) * mix
        green = colors[index][1] + (colors[next][1] - colors[index][1]) * mix
        blue = colors[index][2] + (colors[next][2] - colors[index][2]) * mix
      }

      if (textured) {
        const textureX = Math.floor((col + 0.5) * 1920 / width)
        light += textureAt(layer.texture, u * radiusX * aspect, v * radiusY, textureX, textureY, scale, layer.seed) * strength
      }

      pixels[offset] = red + light
      pixels[offset + 1] = green + light
      pixels[offset + 2] = blue + light
      pixels[offset + 3] = alpha * 255
    }
  }
  ctx.putImageData(frame, 0, 0)
}

export function drawGradient(canvas: HTMLCanvasElement, config: GradientConfig) {
  const ctx = canvas.getContext("2d")
  if (!ctx) return

  const width = canvas.width
  const height = canvas.height
  const previous = layerCache.get(canvas) ?? new Map<string, CacheEntry>()
  const cache = new Map<string, CacheEntry>()

  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = config.base
  ctx.fillRect(0, 0, width, height)

  for (const layer of config.layers) {
    if (!layer.visible || layer.opacity === 0 || layer.colors.length === 0) continue
    const { id, name, opacity, blend, visible, ...paint } = layer
    const key = JSON.stringify([width, height, paint])
    let entry = previous.get(id)
    if (entry?.key !== key) {
      const surface = entry?.canvas ?? canvas.ownerDocument.createElement("canvas")
      if (surface.width !== width) surface.width = width
      if (surface.height !== height) surface.height = height
      rasterLayer(surface, layer)
      entry = { key, canvas: surface }
    }
    cache.set(id, entry)
    ctx.globalAlpha = opacity / 100
    ctx.globalCompositeOperation = blend
    ctx.drawImage(entry.canvas, 0, 0)
  }

  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = "source-over"
  layerCache.set(canvas, cache)
}

export const defaultGradient: GradientConfig = {
  "base": "#558DA1",
  "layers": [
    {
      "id": "field",
      "name": "Ocean wash",
      "effect": "mesh",
      "colors": [
        "#E3F5EF",
        "#6EA7C1",
        "#275674",
        "#78B7CE",
        "#B7E4E3"
      ],
      "texture": "grain",
      "blend": "source-over",
      "x": 50,
      "y": 50,
      "width": 216,
      "height": 204,
      "angle": -18,
      "opacity": 100,
      "softness": 68,
      "warp": 67,
      "strength": 19,
      "scale": 100,
      "seed": 8,
      "visible": true
    },
    {
      "id": "fold",
      "name": "Silk current",
      "effect": "silk",
      "colors": [
        "#376994",
        "#65A1B8",
        "#ABBFCF",
        "#CBEEEA",
        "#F0FFF2"
      ],
      "texture": "grain",
      "blend": "source-over",
      "x": 51,
      "y": 49,
      "width": 187,
      "height": 200,
      "angle": -32,
      "opacity": 75,
      "softness": 94,
      "warp": 37,
      "strength": 20,
      "scale": 100,
      "seed": 45,
      "visible": true
    },
    {
      "id": "light",
      "name": "Seafoam light",
      "effect": "radial",
      "colors": [
        "#F2FFF2",
        "#BDE9E1",
        "#7DC2C9"
      ],
      "texture": "grain",
      "blend": "screen",
      "x": 76,
      "y": 29,
      "width": 84,
      "height": 139,
      "angle": 0,
      "opacity": 55,
      "softness": 91,
      "warp": 4,
      "strength": 16,
      "scale": 100,
      "seed": 23,
      "visible": true
    }
  ]
}

export type GradientBackgroundProps = {
  config?: GradientConfig
  width?: number
  height?: number
  className?: string
  style?: CSSProperties
}

export default function GradientBackground({
  config = defaultGradient,
  width = 1920,
  height = 1080,
  className,
  style,
}: GradientBackgroundProps) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (canvas.current) drawGradient(canvas.current, config)
  }, [config, width, height])

  return (
    <canvas
      ref={canvas}
      width={width}
      height={height}
      className={className}
      aria-hidden="true"
      style={{
        display: "block",
        width: "100%",
        height: "auto",
        backgroundColor: config.base,
        ...style,
      }}
    />
  )
}
