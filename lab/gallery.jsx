import { useEffect, useId, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import DotPortrait from "./sources/DotPortrait.tsx";
import HoverBloomText from "./sources/HoverBloomText.tsx";
import { LiquidOrb, PALETTES } from "./sources/LiquidOrb.jsx";
import { AsciiPortrait } from "./sources/AsciiPortrait.jsx";
import GradientBackground from "./sources/GradientBackground.tsx";

export const components = [
  {
    id: "liquid-orb",
    name: "Liquid Orb",
    hint: "轻触播放或暂停",
    description: "一颗戴墨镜的流体渐变球。试试不同的流动方式和配色。",
    keywords: "React 动效 流体 渐变 Canvas",
    files: ["LiquidOrb.jsx", "liquid-orb.js"],
    download: "liquid-orb-react.zip",
  },
  {
    id: "dot-portrait",
    name: "DotPortrait",
    hint: "悬停或轻触，看看笑脸",
    description: "点阵自画像。掠过或轻触时，颗粒会偏转，表情会逐渐变成笑脸。",
    keywords: "React 点阵 肖像 悬停 触摸 WebGL",
    files: ["DotPortrait.tsx"],
  },
  {
    id: "hover-bloom",
    name: "HoverBloomText",
    hint: "滑过文字，看光晕绽开",
    description: "把光标移过字母，或在触屏上划过文字，字形会浮起并带出暖调光晕。",
    keywords: "React 文字 字体 悬停 光晕 Canvas",
    files: ["HoverBloomText.tsx"],
  },
  {
    id: "ascii-portrait",
    name: "ASCII Portrait",
    hint: "滑过留下字符尾迹，轻触激起涟漪",
    description: "字符与墨点组成的互动肖像。移动光标或手指留下尾迹，点按可以激起涟漪。",
    keywords: "React ASCII 字符 点阵 肖像 动效 Canvas 涟漪",
    files: ["AsciiPortrait.jsx", "portrait-wake.js"],
    standalone: "ASCII Portrait.html",
  },
  {
    id: "gradient-background",
    name: "Gradient Background",
    hint: "拖动渐变图层，导出 PNG",
    description: "完整的多图层渐变工作台，支持位置和大小调整、配色预设以及 PNG 和 React 导出。",
    keywords: "Gradient Studio GradientBackground React Canvas 渐变 背景 纹理 网格 丝绸",
    studio: "./gradient-studio/",
  },
];

const sourceURL = file => new URL("./sources/" + file, import.meta.url).href;
const PALETTE_NAMES = { blue: "蓝色", green: "绿色", purple: "紫色", orange: "橙色" };
const FLOW_NAMES = { wave: "波浪", jelly: "果冻", bloom: "扩散" };
const BLOOM_LINES = ["Hover Bloom", "Move across the letters."];
const COOL_PORTRAIT = ["#3175db", "#9e83f5"];
const COOL_PORTRAIT_DARK = ["#68a8ff", "#c1a4ff"];

function defaults(id) {
  if (id === "liquid-orb") {
    return {
      mode: "bloom",
      colors: PALETTES.green,
      speed: .55,
      size: 300,
      playing: !matchMedia("(prefers-reduced-motion: reduce)").matches,
    };
  }
  if (id === "dot-portrait") return { theme: "auto", cool: true };
  if (id === "ascii-portrait") {
    return { theme: "Paper", glyphs: "Classic", size: 4.5, ripple: true, original: false };
  }
  if (id === "gradient-background") return null;
  return { text: BLOOM_LINES.join("\n"), active: true };
}

function Portrait({ settings }) {
  const container = useRef(null);
  const [supported, setSupported] = useState(true);
  useEffect(() => {
    const canvas = container.current.querySelector("canvas");
    if (!canvas?.getContext("webgl")) setSupported(false);
  }, []);
  return (
    <div ref={container} className="lab-demo-portrait" style={{width: "100%"}}>
      {supported ? (
        <DotPortrait
          theme={settings.theme === "auto" ? undefined : settings.theme}
          dayColors={settings.cool ? COOL_PORTRAIT : undefined}
          nightColors={settings.cool ? COOL_PORTRAIT_DARK : undefined}
          label="点阵自画像"
        />
      ) : <p role="status">当前浏览器无法预览 WebGL 点阵。</p>}
    </div>
  );
}

function Bloom({ settings }) {
  const lines = settings.text.split("\n").map(line => line.trim()).filter(Boolean).slice(0, 3);
  const display = lines.length ? lines : BLOOM_LINES;
  if (!settings.active) {
    return (
      <div className="lab-demo-bloom">
        <div role="group" aria-label={display.join(" ")}
             style={{textAlign: "center", color: "#1c1e29", fontFamily: "Instrument Serif, Georgia, serif"}}>
          {display.map((line, index) => (
            <div key={index} aria-hidden="true" style={{fontSize: index ? ".5em" : "1em"}}>{line}</div>
          ))}
        </div>
      </div>
    );
  }
  return <HoverBloomText className="lab-demo-bloom" lines={display} />;
}

let asciiArtworkRequest;

function loadAsciiArtwork(file) {
  if (!asciiArtworkRequest) {
    asciiArtworkRequest = fetch(sourceURL(file)).then(async response => {
      if (!response.ok) throw new Error("Portrait file could not be opened");
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const { image, matte } = JSON.parse(doc.getElementById("payload").textContent);
      if (!image?.startsWith("data:image/jpeg;base64,") || !matte?.startsWith("data:image/png;base64,")) {
        throw new Error("Portrait assets are missing");
      }
      return { image, matte };
    }).catch(error => {
      asciiArtworkRequest = null;
      throw error;
    });
  }
  return asciiArtworkRequest;
}

function AsciiPreview({ file, settings }) {
  const [art, setArt] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    loadAsciiArtwork(file).then(
      value => { if (active) setArt(value); },
      () => { if (active) setFailed(true); },
    );
    return () => { active = false; };
  }, [file]);

  if (!art) return <p role="status">{failed ? "预览加载失败，可打开完整工作台。" : "正在加载肖像…"}</p>;
  const { original, ...effect } = settings;
  return (
    <AsciiPortrait src={art.image} matte={art.matte} original={original} settings={effect}
                   className="lab-demo-ascii" style={{position: "absolute", inset: 0, aspectRatio: "auto"}} />
  );
}

function Preview({ item, settings, tile }) {
  const [orbPlaying, setOrbPlaying] = useState(false);
  const layer = tile ? "tile" : "modal";
  const scheme =
    item.id === "dot-portrait" && settings.theme !== "auto" ? " lab-stage--" + settings.theme :
    item.id === "hover-bloom" ? " lab-stage--bloom" :
    item.id === "ascii-portrait" ? " lab-stage--ascii" : "";
  return (
    <div className={"lab-stage lab-stage--" + layer + scheme}>
      {item.id === "liquid-orb" && (tile ? (
        <button type="button" className="lab-orb-toggle" aria-pressed={orbPlaying}
                aria-label="播放或暂停 Liquid Orb"
                onClick={() => setOrbPlaying(playing => !playing)}>
          <LiquidOrb {...settings} playing={orbPlaying} className="lab-demo-orb" label="流体渐变球" />
        </button>
      ) : <LiquidOrb {...settings} className="lab-demo-orb" label="流体渐变球" />)}
      {item.id === "dot-portrait" && <Portrait settings={settings} />}
      {item.id === "hover-bloom" && <Bloom settings={settings} />}
      {item.id === "ascii-portrait" && <AsciiPreview file={item.standalone} settings={settings} />}
      {item.id === "gradient-background" && (
        <div className="lab-demo-gradient" role="img" aria-label="多图层渐变背景">
          <GradientBackground width={420} height={252} style={{height: "100%", objectFit: "cover"}} />
        </div>
      )}
    </div>
  );
}

function Segments({ label, options, value, onChange }) {
  return (
    <div className="lab-control-row">
      <span>{label}</span>
      <div className="lab-group" role="group" aria-label={label}>
        {Object.entries(options).map(([key, name]) => (
          <button key={key} type="button" className="lab-pill" aria-pressed={value === key}
                  onClick={() => onChange(key)}>{name}</button>
        ))}
      </div>
    </div>
  );
}

function Range({ label, value, min, max, step, unit, onChange }) {
  const id = useId();
  return (
    <div className="lab-control-row lab-control-row--range">
      <label htmlFor={id}>{label}</label>
      <output htmlFor={id}>{value}{unit}</output>
      <input id={id} type="range" min={min} max={max} step={step} value={value}
             onChange={event => onChange(event.target.valueAsNumber)} />
    </div>
  );
}

function Controls({ item, settings, change }) {
  if (item.id === "dot-portrait") {
    return (
      <div className="lab-controls">
        <Segments label="主题" options={{auto: "跟随", light: "浅色", dark: "深色"}}
                  value={settings.theme} onChange={theme => change({theme})} />
        <Segments label="配色" options={{original: "原色", cool: "冷色"}}
                  value={settings.cool ? "cool" : "original"}
                  onChange={palette => change({cool: palette === "cool"})} />
      </div>
    );
  }
  if (item.id === "hover-bloom") {
    return (
      <div className="lab-controls">
        <label className="lab-text-field">
          演示文字
          <textarea rows={3} maxLength={120} value={settings.text}
                    onChange={event => change({text: event.target.value})} />
        </label>
        <label className="lab-control-row">
          <span>光晕动效</span>
          <input type="checkbox" checked={settings.active}
                 onChange={event => change({active: event.target.checked})} />
        </label>
      </div>
    );
  }
  if (item.id === "ascii-portrait") {
    return (
      <div className="lab-controls">
        <Segments label="主题" options={{Paper: "纸面", Night: "夜色"}}
                  value={settings.theme} onChange={theme => change({theme})} />
        <Segments label="字符" options={{Classic: "经典", Blocks: "方块", Dots: "圆点", Binary: "01"}}
                  value={settings.glyphs} onChange={glyphs => change({glyphs})} />
        <Range label="颗粒大小" value={settings.size} min={3} max={10} step={.1} unit=" px"
               onChange={size => change({size})} />
        <label className="lab-control-row">
          <span>点按涟漪</span>
          <input type="checkbox" checked={settings.ripple}
                 onChange={event => change({ripple: event.target.checked})} />
        </label>
        <label className="lab-control-row">
          <span>查看原图</span>
          <input type="checkbox" checked={settings.original}
                 onChange={event => change({original: event.target.checked})} />
        </label>
      </div>
    );
  }

  return (
    <div className="lab-controls">
      <Segments label="流动" options={FLOW_NAMES} value={settings.mode} onChange={mode => change({mode})} />
      <label className="lab-control-row">
        <span>自动播放</span>
        <input type="checkbox" checked={settings.playing}
               onChange={event => change({playing: event.target.checked})} />
      </label>
      <Range label="速度" value={settings.speed} min={.25} max={2} step={.05} unit="×"
             onChange={speed => change({speed})} />
      <Range label="大小" value={settings.size} min={104} max={360} step={1} unit=" px"
             onChange={size => change({size})} />
      <div className="lab-control-row">
        <span>配色</span>
        <div className="lab-swatches" role="group" aria-label="渐变配色">
          {Object.entries(PALETTES).map(([key, colors]) => (
            <button key={key} type="button" className="lab-swatch"
                    style={{"--swatch": `linear-gradient(140deg, ${colors[2]}, ${colors[0]})`}}
                    aria-label={PALETTE_NAMES[key]} title={PALETTE_NAMES[key]}
                    aria-pressed={settings.colors.every((color, index) => color === colors[index])}
                    onClick={() => change({colors})} />
          ))}
        </div>
      </div>
      <div className="lab-control-row">
        <span>自定义渐变</span>
        <div className="lab-swatches">
          {settings.colors.map((color, index) => (
            <input key={index} type="color" className="lab-color-input"
                   aria-label={["深色", "中间色", "浅色"][index]} value={color}
                   onChange={event => {
                     const colors = [...settings.colors];
                     colors[index] = event.target.value;
                     change({colors});
                   }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function SourcePanel({ item }) {
  const [file, setFile] = useState(item.files[0]);
  const [state, setState] = useState({file: null, code: null, error: false});
  const [feedback, setFeedback] = useState("");
  const codeElement = useRef(null);

  useEffect(() => {
    const request = new AbortController();
    fetch(sourceURL(file), {signal: request.signal})
      .then(response => {
        if (!response.ok) throw new Error("Source request failed");
        return response.text();
      })
      .then(code => setState({file, code, error: false}))
      .catch(error => {
        if (error.name !== "AbortError") setState({file, code: null, error: true});
      });
    setFeedback("");
    return () => request.abort();
  }, [file]);

  const code = state.file === file ? state.code : null;
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setFeedback("已复制源码");
    } catch {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(codeElement.current);
      selection.removeAllRanges();
      selection.addRange(range);
      setFeedback("已选中源码，可按复制快捷键");
    }
  }

  return (
    <div className="lab-code" id="lab-source-panel" role="tabpanel" aria-labelledby="lab-code-tab">
      <div className="lab-code-tools">
        {item.files.length > 1 ? (
          <select aria-label="源码文件" value={file} onChange={event => setFile(event.target.value)}>
            {item.files.map(name => <option key={name}>{name}</option>)}
          </select>
        ) : <b>{file}</b>}
        <button type="button" className="lab-compact" disabled={code === null}
                onClick={copy}>复制源码</button>
      </div>
      {code !== null ? (
        <pre tabIndex={0}><code ref={codeElement}>{code}</code></pre>
      ) : (
        <p className="lab-source-error" role="status">{state.file === file && state.error ?
          "暂时无法读取源码，可以直接下载。" : "正在读取源码…"}</p>
      )}
      {feedback && <p className="lab-status" role="status">{feedback}</p>}
    </div>
  );
}

function useLabDialog() {
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    document.documentElement.classList.add("lab-dialog-open");
    return () => {
      if (element.open) element.close();
      document.documentElement.classList.remove("lab-dialog-open");
    };
  }, []);
  return dialog;
}

function StudioDialog({ item, onClose }) {
  const dialog = useLabDialog();
  const frame = useRef(null);

  useEffect(() => {
    function closeFromStudio(event) {
      if (event.origin === location.origin && event.source === frame.current?.contentWindow &&
          event.data === "gradient-studio:close") onClose();
    }
    window.addEventListener("message", closeFromStudio);
    return () => window.removeEventListener("message", closeFromStudio);
  }, [onClose]);

  return (
    <dialog ref={dialog} className="lab-dialog lab-dialog--studio" aria-label={item.name}
            onCancel={event => { event.preventDefault(); onClose(); }}>
      <button type="button" className="lab-compact lab-compact--close lab-studio-close"
              aria-label="关闭组件详情" autoFocus onClick={onClose}>×</button>
      <iframe ref={frame} className="lab-studio-frame" title="Gradient Studio"
              src={new URL(item.studio, import.meta.url).href} />
    </dialog>
  );
}

function Playground({ item, onClose }) {
  const dialog = useLabDialog();
  const [view, setView] = useState("preview");
  const [settings, setSettings] = useState(() => defaults(item.id));
  function change(patch) { setSettings(current => ({...current, ...patch})); }

  const viewTabs = [["preview", "预览", "lab-preview-panel"], ["code", "源码", "lab-source-panel"]];

  function moveTab(event) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? "preview" : event.key === "End" ? "code" :
      view === "preview" ? "code" : "preview";
    setView(next);
    dialog.current.querySelector("#lab-" + next + "-tab").focus();
  }

  return (
    <dialog ref={dialog} className="lab-dialog" aria-labelledby="lab-title"
            onCancel={event => { event.preventDefault(); onClose(); }}
            onClick={event => { if (event.target === dialog.current) onClose(); }}>
      <div className="lab-dialog-grid">
        <div className="lab-workspace">
          <div className="lab-workspace-bar">
            <div className="lab-group" role="tablist" aria-label="组件视图" onKeyDown={moveTab}>
              {viewTabs.map(([key, label, target]) => (
                <button key={key} type="button" id={"lab-" + key + "-tab"} role="tab"
                        className="lab-pill" aria-selected={view === key} aria-controls={target}
                        tabIndex={view === key ? 0 : -1} onClick={() => setView(key)}>{label}</button>
              ))}
            </div>
            <button type="button" className="lab-compact"
                    onClick={() => {
                      setSettings(defaults(item.id));
                      setView("preview");
                    }}>重置</button>
          </div>
          <div id="lab-preview-panel" role="tabpanel" aria-labelledby="lab-preview-tab"
               className="lab-preview-panel" hidden={view !== "preview"}>
            {view === "preview" && <Preview item={item} settings={settings} />}
          </div>
          {view === "code" ? <SourcePanel item={item} /> :
            <div id="lab-source-panel" role="tabpanel" aria-labelledby="lab-code-tab" hidden />}
        </div>
        <aside className="lab-detail">
          <div className="lab-detail-header">
            <h2 id="lab-title">{item.name}</h2>
            <button type="button" className="lab-compact lab-compact--close" aria-label="关闭组件详情"
                    autoFocus onClick={onClose}>×</button>
          </div>
          <p>{item.description}</p>
          <Controls item={item} settings={settings} change={change} />
          <div className="lab-detail-footer">
            {item.standalone && (
              <a href={sourceURL(item.standalone)} target="_blank" rel="noopener">打开完整工作台 ↗</a>
            )}
            <a href={sourceURL(item.standalone || item.download || item.files[0])} download>
              {item.standalone ? "下载 HTML" : item.download ? "下载 React 源码包" : "下载 TSX 源码"}
            </a>
          </div>
        </aside>
      </div>
    </dialog>
  );
}

function Gallery({ items }) {
  const [selected, setSelected] = useState(null);
  const opener = useRef(null);
  const Detail = selected?.studio ? StudioDialog : Playground;

  function closeDetail() {
    setSelected(null);
    requestAnimationFrame(() => opener.current?.focus());
  }

  return (
    <>
      {!items.length && <div className="empty"><b>没有匹配的组件</b>试试组件名，如 DotPortrait。</div>}
      <div className="lab-gallery">
        {items.map(item => (
          <article className="lab-card" key={item.id}>
            <Preview item={item} settings={defaults(item.id)} tile />
            <div className="lab-card-info">
              <div><h3>{item.name}</h3><p>{item.hint}</p></div>
              <button type="button" className="lab-compact"
                      aria-label={"查看 " + item.name + " 详情"} onClick={event => {
                        opener.current = event.currentTarget;
                        setSelected(item);
                      }}>查看详情</button>
            </div>
          </article>
        ))}
      </div>
      {selected && <Detail item={selected} onClose={closeDetail} />}
    </>
  );
}

export function mountGallery(host, query) {
  const root = createRoot(host);
  function update(value) {
    const words = value.trim().toLowerCase().split(/\s+/);
    const items = components.filter(item => {
      const terms = [item.name, item.id, item.description, item.keywords].join(" ").toLowerCase();
      return words.every(word => terms.includes(word));
    });
    root.render(<Gallery items={items} />);
  }
  update(query);
  return { update, unmount: () => root.unmount() };
}
