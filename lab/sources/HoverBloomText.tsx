import { Fragment, useEffect, useRef } from "react"
import type { CSSProperties } from "react"

/* Parameters exported from the tweak panel, unchanged.
   The component below reads: text, scale, reach, inner, rise, settle, lift, blur,
   size, colour, fade, glow, glowR, glowA, glowBlurOn, glowBlur, spread, flow.
   (palette is "sunset"; bloom / sparkles / shape / bloom* / spark* / soft are
   switched off in these settings, so that code is not included.) */
const PARAMS = {
  text: "A product designer with an art director’s eye.\nGamma’s work spans 0-to-1 product design,\nimmersive interactive experiences, and brand storytelling.",
  scale: 1,
  font: "instrument",
  reach: 1.6,
  inner: 0.04,
  rise: 0.22,
  settle: 0.035,
  lift: 0.11,
  blur: 0.03,
  size: 0.28,
  colour: 0.64,
  fade: 0.85,
  glow: true,
  glowR: 1.25,
  glowA: 0.3,
  glowBlurOn: true,
  glowBlur: 26,
  palette: "sunset",
  flow: 0.1,
  spread: 2.2,
  bloom: false,
  sparkles: false,
  shape: "mixed",
  bloomS: 0.5,
  bloomD: 0.5,
  bounce: 0.6,
  sparkS: 0.11,
  sparkN: 2.5,
  soft: 0,
  boxes: false,
  rings: false,
  wander: false,
  fx: true,
}

type RGB = [number, number, number]

const hex = (h: string): RGB => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
]
// "sunset" palette: lemon, amber, orange, red-orange
const STOPS: RGB[] = ["#fff173", "#ffd53a", "#ffab2b", "#ff7a1c", "#f1481c", "#ff8f2c"].map(hex)
const INK: RGB = [28, 30, 41]
const TAU = Math.PI * 2

const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x)
const smooth = (t: number) => t * t * (3 - 2 * t)
const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]
const rgb = (c: RGB) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`
function sampleStops(stops: RGB[], u: number): RGB {
  u = u - Math.floor(u) // cyclic gradient
  const x = u * stops.length
  const i = Math.floor(x)
  return mix(stops[i % stops.length], stops[(i + 1) % stops.length], smooth(x - i))
}

interface Letter {
  el: HTMLElement
  line: HTMLElement
  cx: number
  cy: number
  fs: number
  fr: number
  u0: number
  v: number
  styled: boolean
}

interface Props {
  /** Optional override. First line is the headline, the rest are smaller. */
  lines?: string[]
  className?: string
  style?: CSSProperties
}

export default function HoverBloomText({ lines, className, style }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const content = (lines ?? PARAMS.text.split("\n")).map((s) => s.trim()).filter(Boolean)
  const contentKey = content.join("\n")

  useEffect(() => {
    const text = textRef.current
    const canvas = canvasRef.current
    if (!text || !canvas) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const P = PARAMS

    // Font used in the original. Remove this block if the site already loads its own serif.
    if (!document.getElementById("hb-font")) {
      const l = document.createElement("link")
      l.id = "hb-font"
      l.rel = "stylesheet"
      l.href = "https://fonts.googleapis.com/css2?family=Instrument+Serif&display=swap"
      document.head.appendChild(l)
    }

    /* 01 · Letters: every character is its own box, centre = transform origin */
    const letters: Letter[] = Array.from(text.querySelectorAll<HTMLElement>("[data-hb-ch]")).map((el) => ({
      el,
      line: el.closest("[data-hb-line]") as HTMLElement,
      cx: 0, cy: 0, fs: 16, fr: 1, u0: 0, v: 0, styled: false,
    }))

    let EM = 48, W = 1, H = 1, PAD = 0
    const GS = 0.5 // the glow is blurred anyway, half resolution is plenty

    const measure = () => {
      W = Math.max(1, text.offsetWidth)
      H = Math.max(1, text.offsetHeight)
      const head = text.querySelector<HTMLElement>("[data-hb-line]")
      EM = head ? parseFloat(getComputedStyle(head).fontSize) : 48
      PAD = Math.ceil(P.glowR * EM + (P.glowBlurOn ? P.glowBlur * 3 : 0))
      canvas.style.left = -PAD + "px"
      canvas.style.top = -PAD + "px"
      canvas.style.width = W + PAD * 2 + "px"
      canvas.style.height = H + PAD * 2 + "px"
      canvas.width = Math.ceil((W + PAD * 2) * GS)
      canvas.height = Math.ceil((H + PAD * 2) * GS)
      ctx.setTransform(GS, 0, 0, GS, 0, 0)
      const sizes = new Map<HTMLElement, number>()
      for (const L of letters) {
        if (!sizes.has(L.line)) sizes.set(L.line, parseFloat(getComputedStyle(L.line).fontSize))
        L.fs = sizes.get(L.line)!
        L.fr = L.fs / EM
        // offsets ignore transforms, so this is safe mid-animation
        L.cx = L.el.offsetLeft + L.el.offsetWidth / 2
        L.cy = L.el.offsetTop + L.el.offsetHeight / 2
        L.u0 = L.cx / W + (L.cy / H) * 0.35
      }
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(text)
    document.fonts?.ready.then(measure)

    /* Pointer */
    let mx = -9999, my = -9999, on = false
    const onMove = (e: PointerEvent) => { mx = e.clientX; my = e.clientY; on = true }
    const onLeave = () => { on = false }
    const onUp = (e: PointerEvent) => { if (e.pointerType === "touch") on = false }
    window.addEventListener("pointermove", onMove, { passive: true })
    window.addEventListener("pointerdown", onMove, { passive: true })
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onLeave)
    window.addEventListener("blur", onLeave)
    document.documentElement.addEventListener("pointerleave", onLeave)

    /* Frame loop */
    let last = performance.now(), time = 0, raf = 0, wasBusy = true
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      time += dt
      const f = dt * 60

      const rect = text.getBoundingClientRect()
      const px = mx - rect.left
      const py = my - rect.top
      const R = P.reach * EM
      const r0 = R * P.inner

      // 03 · rise fast, settle slowly (frame-rate independent)
      const kUp = 1 - Math.pow(1 - P.rise, f)
      const kDown = 1 - Math.pow(1 - P.settle, f)

      if (wasBusy) ctx.clearRect(0, 0, W + PAD * 2, H + PAD * 2)
      let busy = false

      for (const L of letters) {
        // 02 · distance to the cursor → 0..1
        let t = 0
        if (on) {
          const d = Math.hypot(px - L.cx, py - L.cy)
          t = d <= r0 ? 1 : d >= R ? 0 : 1 - smooth((d - r0) / (R - r0))
        }
        L.v += (t - L.v) * (t > L.v ? kUp : kDown)
        if (L.v < 0.002 && t === 0) L.v = 0
        const v = L.v

        if (v <= 0) {
          if (L.styled) { L.el.style.cssText = "display:inline-block;transform-origin:50% 50%"; L.styled = false }
          continue
        }
        busy = true

        // 04 · one number, five curves
        const lift = 1 - Math.pow(1 - v, 2.4)
        const blur = Math.pow(v, 2) * P.blur
        const size = 1 + Math.pow(v, 2.2) * P.size
        const tint = Math.pow(clamp((v - 1 / 3) / (2 / 3), 0, 1), 1.5) * P.colour
        const fade = clamp((v - 0.78) / 0.22, 0, 1) * P.fade

        const colour = sampleStops(STOPS, L.u0 * P.spread + time * P.flow)
        const s = L.el.style
        s.transform = `translate3d(0,${(-lift * P.lift).toFixed(4)}em,0) scale(${size.toFixed(4)})`
        s.filter = blur > 0.003 ? `blur(${blur.toFixed(4)}em)` : ""
        s.color = tint > 0.004 ? rgb(mix(INK, colour, tint)) : ""
        s.opacity = fade > 0.004 ? (1 - fade).toFixed(3) : ""
        L.styled = true

        // 05 · a soft colour circle under every lifted letter
        if (P.glow && v > 0.02) {
          const g = Math.pow(v, 1.3)
          const rad = P.glowR * EM * (0.55 + 0.45 * L.fr) * (0.5 + 0.5 * v)
          const a = P.glowA * g * (0.5 + 0.5 * L.fr)
          const c = `${colour[0] | 0},${colour[1] | 0},${colour[2] | 0}`
          const x = L.cx + PAD
          const y = L.cy + PAD
          const grad = ctx.createRadialGradient(x, y, 0, x, y, rad)
          grad.addColorStop(0, `rgba(${c},${a})`)
          grad.addColorStop(0.55, `rgba(${c},${a * 0.75})`)
          grad.addColorStop(1, `rgba(${c},0)`)
          ctx.fillStyle = grad
          ctx.beginPath()
          ctx.arc(x, y, rad, 0, TAU)
          ctx.fill()
        }
      }

      wasBusy = busy
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerdown", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onLeave)
      window.removeEventListener("blur", onLeave)
      document.documentElement.removeEventListener("pointerleave", onLeave)
      for (const L of letters) L.el.style.cssText = "display:inline-block;transform-origin:50% 50%"
    }
  }, [contentKey])

  return (
    <div ref={rootRef} className={className} style={{ position: "relative", ...style }}>
      {/* glow layer: sits behind the text and extends past it so the blur is never clipped */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          zIndex: 0,
          pointerEvents: "none",
          filter: PARAMS.glowBlurOn ? `blur(${PARAMS.glowBlur}px)` : undefined,
        }}
      />
      <div
        ref={textRef}
        role="group"
        aria-label={content.join(" ")}
        style={{
          position: "relative",
          zIndex: 1,
          textAlign: "center",
          color: rgb(INK),
          fontFamily: "'Instrument Serif', 'Iowan Old Style', 'Hoefler Text', Georgia, serif",
          fontWeight: 400,
          fontSize: `calc(clamp(20px, 3.7vw, 64px) * ${PARAMS.scale})`,
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      >
        {content.map((line, li) => (
          <div
            key={li}
            data-hb-line=""
            aria-hidden="true"
            style={
              li === 0
                ? { fontSize: "1em", lineHeight: 1.1, letterSpacing: "-0.01em", marginBottom: "0.42em" }
                : { fontSize: "0.5em", lineHeight: 1.42 }
            }
          >
            {line.split(/\s+/).map((w, wi) => (
              <Fragment key={wi}>
                {wi > 0 && " "}
                <span style={{ display: "inline-block", whiteSpace: "nowrap" }}>
                  {Array.from(w).map((c, ci) => (
                    <span key={ci} data-hb-ch="" style={{ display: "inline-block", transformOrigin: "50% 50%" }}>
                      {c}
                    </span>
                  ))}
                </span>
              </Fragment>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
