import type { ChartConfig } from "./charts.js";

const ns = "http://www.w3.org/2000/svg";
const moveEase = "cubic-bezier(0.77, 0, 0.175, 1)";
const fadeEase = "cubic-bezier(0.23, 1, 0.32, 1)";
const barBudget = 64;
const pointBudget = 560;
const layerSelector = ".viz-horizon-outgoing";
const graphics = "[data-bar-index], [data-line-series], [data-line-area], [data-heat-index]";
const rect = (node: Element) => ["x", "y", "width", "height"].map(key => Number(node.getAttribute(key)));

type Point = { x: number; y: number; series: number };
type Mark = { label: string; x: number; points?: Point[] };
type Geometry = { width: number; height: number; marks: Mark[]; lineBounds?: { top: number; bottom: number; right: number } };
type Snapshot = { svg: SVGSVGElement; layout: Geometry; scroll: number; top: number; viewportWidth: number; viewportHeight: number; interrupted: boolean; prior: SVGSVGElement[] };
type Play = (node: SVGElement | HTMLElement, frames: Keyframe[], duration?: number, easing?: string) => void;
type Pair = { from: Point; to: Point };

const make = <K extends keyof SVGElementTagNameMap>(tag: K) => document.createElementNS(ns, tag);
const visibleNodes = (svg: SVGSVGElement, selector: string) =>
  [...svg.querySelectorAll<SVGElement>(selector)].filter(node => !node.closest("defs"));

export function shouldAnimateHorizon(old: ChartConfig, next: ChartConfig) {
  if (old.type !== next.type) return false;
  if ("labels" in old && "labels" in next) {
    return old.labels.length !== next.labels.length || old.labels.some((label, i) => label !== next.labels[i]);
  }
  if (old.type === "heatmap" && next.type === "heatmap") {
    return old.days.length !== next.days.length || old.days.some((day, i) => day.date !== next.days[i].date);
  }
  return false;
}

let snapshotId = 0;
function renameIds(svg: SVGSVGElement) {
  const prefix = "viz-outgoing-" + ++snapshotId + "-";
  svg.querySelectorAll("[id]").forEach(node => { node.id = prefix + node.id; });
  svg.querySelectorAll("[fill], [mask], [clip-path]").forEach(node => {
    for (const key of ["fill", "mask", "clip-path"]) {
      const value = node.getAttribute(key);
      if (value?.startsWith("url(#")) node.setAttribute(key, "url(#" + prefix + value.slice(5));
    }
  });
}

export function captureHorizon(svg: SVGSVGElement, layout: Geometry): Snapshot {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  const plot = svg.parentElement;
  const interrupted = !!plot?.querySelector(".viz-horizon-clip");
  const prior = [...plot?.querySelectorAll<SVGSVGElement>(layerSelector) ?? []];
  const freeze = (source: SVGSVGElement, target: SVGSVGElement) => {
    const originals = [source, ...source.querySelectorAll<SVGElement>("[data-horizon-moving]")];
    const copies = [target, ...target.querySelectorAll<SVGElement>("[data-horizon-moving]")];
    for (let i = 0; i < originals.length; i++) {
      const style = getComputedStyle(originals[i]);
      copies[i].style.opacity = style.opacity;
      copies[i].style.transform = style.transform;
      copies[i].style.transformOrigin = style.transformOrigin;
      copies[i].removeAttribute("data-horizon-moving");
    }
  };
  // On interruption preserve the live frame and the two most recent fading layers.
  if (interrupted) freeze(svg, copy);
  const strongest = new Set(prior.map(layer => ({ layer, alpha: Number(getComputedStyle(layer).opacity) }))
    .sort((a, b) => b.alpha - a.alpha).slice(0, 2).map(entry => entry.layer));
  const previous = prior.filter(layer => strongest.has(layer)).map(source => {
    const layer = source.cloneNode(true) as SVGSVGElement;
    freeze(source, layer);
    renameIds(layer);
    return layer;
  });
  copy.removeAttribute("role");
  copy.removeAttribute("aria-label");
  copy.setAttribute("aria-hidden", "true");
  copy.classList.add("viz-horizon-outgoing");
  copy.querySelector(".viz-line-markers")?.remove();
  renameIds(copy);
  return {
    svg: copy, layout, interrupted, prior: previous,
    scroll: plot?.scrollLeft ?? 0, top: plot?.scrollTop ?? 0,
    viewportWidth: plot?.clientWidth ?? 0, viewportHeight: plot?.clientHeight ?? 0,
  };
}

function indexByLabel(marks: Mark[]) {
  const indices = new Map<string, number>();
  for (const [i, mark] of marks.entries()) {
    if (indices.has(mark.label)) return;
    indices.set(mark.label, i);
  }
  return indices;
}

function position(from: number[], to: number[]) {
  const [x, y, w, h] = to;
  const sx = from[2] / w;
  const sy = from[3] / h;
  if (!(sx > 0 && sy > 0 && Number.isFinite(sx) && Number.isFinite(sy))) return;
  return `matrix(${sx}, 0, 0, ${sy}, ${from[0] - x * sx}, ${from[1] - y * sy})`;
}

function fadeInk(svg: SVGSVGElement, opacity: number, play: Play) {
  let layer: SVGGElement | undefined;
  for (const node of [...svg.children] as SVGElement[]) {
    if (!node.matches("rect, path, [data-horizon-stack]")) {
      layer = undefined;
      continue;
    }
    if (!layer) {
      layer = make("g");
      node.before(layer);
      play(layer, [{ opacity }, { opacity: 1 }]);
    }
    layer.append(node);
  }
}

function groups(svg: SVGSVGElement, stacked: boolean) {
  const result = new Map<number, SVGElement[]>();
  const selector = stacked ? "[data-horizon-stack]" : "[data-bar-index]";
  for (const node of visibleNodes(svg, selector)) {
    const index = Number(node.getAttribute(stacked ? "data-horizon-stack" : "data-bar-index"));
    const items = result.get(index) ?? [];
    items.push(node);
    result.set(index, items);
  }
  return result;
}

function stackBounds(group: SVGElement) {
  const bars = [...group.querySelectorAll("rect")].map(rect).filter(bar => bar[3] > 0);
  if (!bars.length) return [0, 0, 0, 0];
  const top = Math.min(...bars.map(bar => bar[1]));
  return [bars[0][0], top, bars[0][2], Math.max(...bars.map(bar => bar[1] + bar[3])) - top];
}

function prepareBars(old: Snapshot, svg: SVGSVGElement, layout: Geometry, play: Play, stacked = false) {
  const previous = groups(old.svg, stacked);
  const next = groups(svg, stacked);
  const labels = indexByLabel(old.layout.marks);
  if (!labels || !indexByLabel(layout.marks)) return;
  const moves: [SVGElement, SVGElement, string][] = [];
  for (const [i, nodes] of next) {
    const oldIndex = labels.get(layout.marks[i]?.label);
    const from = oldIndex === undefined ? undefined : previous.get(oldIndex);
    if (!from || from.length !== nodes.length) continue;
    const bucket: typeof moves = [];
    for (let j = 0; j < nodes.length; j++) {
      const node = nodes[j];
      const source = from[j];
      if (node.localName !== source.localName || node.getAttribute("data-series") !== source.getAttribute("data-series")) break;
      let transform: string | undefined;
      if (stacked) {
        const previousRects = [...source.querySelectorAll("rect")].map(rect);
        const nextRects = [...node.querySelectorAll("rect")].map(rect);
        const oldBox = stackBounds(source), box = stackBounds(node);
        // A single transform is valid only when the internal stack boundaries agree.
        const sameStack = previousRects.length === nextRects.length && previousRects.every((bar, k) =>
          Math.abs((bar[1] - oldBox[1]) / oldBox[3] - (nextRects[k][1] - box[1]) / box[3]) < 0.001 &&
          Math.abs(bar[3] / oldBox[3] - nextRects[k][3] / box[3]) < 0.001);
        if (sameStack) transform = position(oldBox, box);
      } else if (node.hasAttribute("data-bar-cap")) {
        const a = rect(from[j - 1]), b = rect(nodes[j - 1]);
        const sx = a[2] / b[2];
        const aBottom = source.getAttribute("data-cap-side") === "bottom";
        const bBottom = node.getAttribute("data-cap-side") === "bottom";
        if (aBottom === bBottom && a[3] >= 2 && b[3] >= 2 && sx > 0 && Number.isFinite(sx)) {
          transform = `matrix(${sx}, 0, 0, 1, ${a[0] - sx * b[0]}, ${a[1] - b[1] + (aBottom ? a[3] - b[3] : 0)})`;
        }
      } else {
        if (node.getAttribute("data-baseline-side") === source.getAttribute("data-baseline-side")) {
          transform = position(rect(source), rect(node));
        }
      }
      if (!transform) break;
      bucket.push([source, node, transform]);
    }
    if (bucket.length === nodes.length) moves.push(...bucket);
    if (moves.length > barBudget) return;
  }
  if (!moves.length) return;
  return () => {
    const active = new Set(moves.map(([, node]) => node));
    for (const [source, node, transform] of moves) {
      source.remove();
      play(node, [{ transform }, { transform: "none" }], undefined, moveEase);
    }
    const unmatched = [...next.values()].flat().filter(node => !active.has(node));
    if (unmatched.length) {
      const layer = make("g");
      svg.insertBefore(layer, unmatched[0]);
      layer.append(...unmatched);
      play(layer, [{ opacity: 0 }, { opacity: 1 }]);
    }
  };
}

function prepareHeat(old: Snapshot, svg: SVGSVGElement, layout: Geometry, play: Play) {
  const labels = indexByLabel(old.layout.marks);
  if (!labels || !indexByLabel(layout.marks)) return false;
  const shared = layout.marks.flatMap(mark => {
    const i = labels.get(mark.label);
    return i === undefined ? [] : [[old.layout.marks[i].x - mark.x, i]];
  });
  const dx = shared[0]?.[0];
  if (!dx || Math.abs(dx) > old.viewportWidth || !shared.every(pair => pair[0] === dx)) return false;
  const oldCells = new Map(visibleNodes(old.svg, "[data-heat-index]").map(node => [Number(node.getAttribute("data-heat-index")), node]));
  const matched = new Set<SVGElement>();
  for (const node of visibleNodes(svg, "[data-heat-index]")) {
    const mark = layout.marks[Number(node.getAttribute("data-heat-index"))];
    const oldIndex = labels.get(mark.label);
    const before = oldIndex === undefined ? undefined : oldCells.get(oldIndex);
    if (!before) continue;
    const [,, w, h] = rect(node), [, y0, w0, h0] = rect(before);
    if (Number(node.getAttribute("y")) !== y0 || w !== w0 || h !== h0) return false;
    matched.add(node);
  }
  const layer = make("g");
  const entering = make("g");
  svg.prepend(entering, layer);
  for (const node of visibleNodes(svg, "rect")) {
    if (matched.has(node)) {
      oldCells.get(labels.get(layout.marks[Number(node.getAttribute("data-heat-index"))].label)!)?.remove();
      layer.append(node);
    } else entering.append(node);
  }
  play(layer, [{ transform: `translateX(${dx}px)` }, { transform: "none" }], undefined, moveEase);
  play(entering, [{ opacity: 0 }, { opacity: 1 }]);
  return true;
}

type LinePart = { points: Pair[]; kind: "shared" | "enter" | "exit" };
function lineParts(before: (Point | undefined)[], after: (Point | undefined)[], aLabels: Mark[], bLabels: Mark[], offset: number): LinePart[] {
  const parts: LinePart[] = [];
  // Split by edges so the moving common trace and the fading tails share endpoints.
  for (const direction of ["shared", "enter", "exit"] as const) {
    const reference = direction === "exit" ? before : after;
    let part: Pair[] | undefined;
    for (let i = 0; i < reference.length - 1; i++) {
      const a = reference[i], b = reference[i + 1];
      const peer = direction === "exit" ? after : before;
      const j = direction === "exit" ? i - offset : i + offset;
      const refLabels = direction === "exit" ? aLabels : bLabels;
      const peerLabels = direction === "exit" ? bLabels : aLabels;
      const aPeer = refLabels[i].label === peerLabels[j]?.label ? peer[j] : undefined;
      const bPeer = refLabels[i + 1].label === peerLabels[j + 1]?.label ? peer[j + 1] : undefined;
      if (!a || !b || (direction === "shared" ? !aPeer || !bPeer : aPeer && bPeer)) {
        part = undefined;
        continue;
      }
      const pair = (point: Point, other?: Point): Pair => direction === "exit"
        ? { from: point, to: other ?? point } : { from: other ?? point, to: point };
      if (!part) {
        part = [pair(a, aPeer)];
        parts.push({ points: part, kind: direction });
      }
      part.push(pair(b, bPeer));
    }
  }
  for (const { points, kind } of parts) {
    if (kind === "shared") continue;
    const anchor = points.find(point => point.from !== point.to);
    if (!anchor) continue;
    const dx = anchor.to.x - anchor.from.x;
    const dy = anchor.to.y - anchor.from.y;
    // Translate an unmatched tail with its adjoining endpoint. Pulling only the
    // endpoint would draw a false diagonal through the disappearing history.
    for (const pair of points) {
      if (pair.from !== pair.to) continue;
      if (kind === "exit") pair.to = { ...pair.from, x: pair.from.x + dx, y: pair.from.y + dy };
      else pair.from = { ...pair.to, x: pair.to.x - dx, y: pair.to.y - dy };
    }
  }
  return parts;
}

function prepareLines(old: Snapshot, svg: SVGSVGElement, layout: Geometry, play: Play) {
  const a = old.layout.marks, b = layout.marks;
  const lookup = indexByLabel(a);
  if (!lookup || !indexByLabel(b) || !old.layout.lineBounds || !layout.lineBounds) return;
  const common = b.flatMap((mark, i) => lookup.has(mark.label) ? [{ a: lookup.get(mark.label)!, b: i }] : []);
  const offset = common[0] ? common[0].a - common[0].b : 0;
  if (common.length < 2 || common.some((pair, i) => pair.a - pair.b !== offset || (i && pair.a !== common[i - 1].a + 1))) return;
  const paths = visibleNodes(svg, "[data-line-series]");
  const oldPaths = visibleNodes(old.svg, "[data-line-series]");
  if (!paths.length || paths.length !== oldPaths.length || (a.length + b.length) * paths.length > pointBudget) return;
  const area = visibleNodes(svg, "[data-line-area]")[0];
  const oldArea = visibleNodes(old.svg, "[data-line-area]")[0];
  if (!!area !== !!oldArea) return;
  const jobs = paths.map((path, i) => {
    const series = Number(path.getAttribute("data-line-series"));
    const from = a.map(mark => mark.points?.find(point => point.series === series));
    const to = b.map(mark => mark.points?.find(point => point.series === series));
    const parts = lineParts(from, to, a, b, offset);
    return { path, oldPath: oldPaths[i], area: series === 0 ? area : undefined, parts,
      valid: common.every(pair => !!from[pair.a] === !!to[pair.b]) &&
        from.every((point, j) => !point || from[j - 1] || from[j + 1]) &&
        to.every((point, j) => !point || to[j - 1] || to[j + 1]) && parts.some(part => part.kind === "shared") };
  });
  if (jobs.some(job => !job.valid) || jobs.reduce((sum, job) => sum + job.parts.length, 0) > 18) return;
  const renderers: ((t: number) => void)[] = [];
  const temporary: SVGElement[] = [];
  const originals: SVGElement[] = [];
  const { top, bottom: bottomTo, right } = layout.lineBounds;
  const bottomFrom = old.layout.lineBounds.bottom;
  const defs = svg.querySelector("defs") ?? make("defs");
  if (!defs.parentNode) {
    svg.prepend(defs);
    temporary.push(defs);
  }
  const clip = make("clipPath");
  clip.id = "viz-horizon-trace-" + ++snapshotId;
  const bounds = make("rect");
  bounds.setAttribute("x", "-1");
  bounds.setAttribute("y", String(top - 1));
  bounds.setAttribute("width", String(right + 2));
  bounds.setAttribute("height", String(Math.max(0, bottomTo - top + 2)));
  clip.append(bounds);
  defs.append(clip);
  temporary.push(clip);
  for (const { path, oldPath, parts, area } of jobs) {
    originals.push(path);
    oldPath.remove();
    if (area) { originals.push(area); oldArea?.remove(); }
    for (const kind of ["shared", "enter", "exit"] as const) {
      const runs = parts.filter(part => part.kind === kind);
      if (!runs.length) continue;
      const stroke = path.cloneNode() as SVGElement;
      const fill = area?.cloneNode() as SVGElement | undefined;
      stroke.removeAttribute("data-line-series");
      stroke.setAttribute("data-horizon-trace", kind);
      stroke.setAttribute("clip-path", `url(#${clip.id})`);
      if (fill) {
        fill.removeAttribute("data-line-area");
        fill.setAttribute("clip-path", `url(#${clip.id})`);
      }
      path.before(stroke);
      if (fill) area?.before(fill);
      temporary.push(stroke, ...(fill ? [fill] : []));
      if (kind !== "shared") {
        for (const node of [stroke, fill]) if (node) {
          play(node, kind === "enter" ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }]);
          if (kind === "exit") node.style.opacity = "0";
        }
      }
      renderers.push(t => {
        let trace = "", surface = "";
        const bottom = mix(bottomFrom, bottomTo, t).toFixed(3);
        for (const { points } of runs) {
          let run = "", first = "", last = "";
          for (let i = 0; i < points.length; i++) {
            const { from, to } = points[i];
            const x = mix(from.x, to.x, t).toFixed(3);
            const y = mix(from.y, to.y, t).toFixed(3);
            if (!i) first = x;
            last = x;
            run += (i ? "L" : "M") + x + "," + y;
          }
          trace += run;
          if (fill) surface += run + "L" + last + "," + bottom + "L" + first + "," + bottom + "Z";
        }
        stroke.setAttribute("d", trace);
        fill?.setAttribute("d", surface);
      });
    }
  }
  originals.forEach(node => { node.style.display = "none"; });
  return {
    frame: (t: number) => renderers.forEach(render => render(t)),
    clean: () => {
      temporary.forEach(node => node.remove());
      originals.forEach(node => node.style.removeProperty("display"));
    },
  };
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
// Match the geometry WAAPI curve without reading styles or layout on animation frames.
function morphProgress(t: number) {
  const bezier = (u: number, p: number, q: number) =>
    3 * (1 - u) ** 2 * u * p + 3 * (1 - u) * u ** 2 * q + u ** 3;
  let lo = 0, hi = 1;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (bezier(mid, 0.77, 0.175) < t) lo = mid;
    else hi = mid;
  }
  return bezier((lo + hi) / 2, 0, 1);
}

export function playHorizon(old: Snapshot, svg: SVGSVGElement, config: ChartConfig, layout: Geometry,
  headline: HTMLElement | undefined, oldMetric: string, reduced: boolean, onFinish: () => void): () => void {
  const win = svg.ownerDocument.defaultView!;
  const plot = svg.parentElement!;
  const outgoing = old.svg;
  const duration = reduced ? 100 : config.type === "line-column" ? 240 : config.type === "line" ? 220
    : config.type === "heatmap" ? 160 : config.type === "range-column" ? 190
    : config.type === "column" && config.stacked ? 200 : 180;
  const animations: Animation[] = [];
  const animated = new Set<Element>();
  let frameId = 0;
  let start = 0;
  let stopped = false;
  let cleanLine: (() => void) | undefined;
  let finishTrace: (() => void) | undefined;
  let traceDone: Promise<void> | undefined;
  let metric: (() => void) | undefined;
  const play: Play = (node, frames, time = duration, easing = fadeEase) => {
    node.setAttribute("data-horizon-moving", "");
    animated.add(node);
    const animation = node.animate(frames, { duration: time, easing, fill: "both" });
    animations.push(animation);
  };

  let matched = false;
  const scrolled = Math.sign(old.scroll) * Math.min(Math.abs(old.scroll), Math.max(0, layout.width - old.viewportWidth));
  const scrolledTop = Math.min(old.top, Math.max(0, layout.height - old.viewportHeight));
  const compatible = !reduced && !old.interrupted && old.scroll === scrolled && old.top === scrolledTop &&
    old.layout.height === layout.height;
  if (compatible) {
    if (config.type === "column" || config.type === "range-column") {
      const bars = prepareBars(old, svg, layout, play, config.type === "column" && !!config.stacked);
      if (bars) { bars(); matched = true; }
    } else if (config.type === "heatmap") matched = prepareHeat(old, svg, layout, play);
    else if (config.type === "line" || config.type === "line-column") {
      const hasVolume = config.type === "line-column" &&
        (visibleNodes(svg, "[data-bar-index]").length || visibleNodes(outgoing, "[data-bar-index]").length);
      const volume = hasVolume ? prepareBars(old, svg, layout, play) : undefined;
      const line = !hasVolume || volume ? prepareLines(old, svg, layout, play) : undefined;
      if (line) {
        volume?.();
        matched = true;
        cleanLine = line.clean;
        line.frame(0);
        traceDone = new Promise(resolve => { finishTrace = resolve; });
        const step = (now: number) => {
          if (stopped) return;
          const t = Math.max(0, Math.min(1, (now - start) / duration));
          line.frame(t === 1 ? 1 : morphProgress(t));
          if (t < 1) frameId = win.requestAnimationFrame(step);
          else finishTrace?.();
        };
        frameId = win.requestAnimationFrame(step);

      }
    }
  }

  // Only plot ink transitions. The new axes are always legible and the outgoing
  // snapshot never exposes two sets of ticks or intercepts a pointer.
  for (const layer of [outgoing, ...old.prior]) {
    layer.querySelectorAll(".viz-axis-label, line").forEach(node => node.remove());
  }
  if (matched) {
    // New axes are authoritative. Remove old labels and use unmasked grid lines
    // beneath the moving marks until the final geometry and mask agree again.
    const maskedGrid = svg.querySelector("g[mask]");
    const mask = maskedGrid?.getAttribute("mask");
    if (maskedGrid && mask) {
      maskedGrid.removeAttribute("mask");
      const clean = cleanLine;
      cleanLine = () => { clean?.(); maskedGrid.setAttribute("mask", mask); };
    }
    if (config.type !== "heatmap") {
      visibleNodes(outgoing, "rect:not([data-bar-index])").forEach(node => node.remove());
      if (!visibleNodes(outgoing, graphics).length) outgoing.replaceChildren();
    }
  } else {
    fadeInk(svg, old.interrupted ? 0 : 0.15, play);
  }
  // Clip the old SVG to the live scrollport so it never changes scroll extent.
  const clip = document.createElement("div");
  clip.className = "viz-horizon-clip";
  clip.setAttribute("aria-hidden", "true");
  clip.style.left = Math.max(0, scrolled) + "px";
  clip.style.top = scrolledTop + "px";
  clip.style.width = old.viewportWidth + "px";
  clip.style.height = Math.min(old.viewportHeight, layout.height) + "px";
  outgoing.style.left = -old.scroll + "px";
  outgoing.style.top = -old.top + "px";
  for (const layer of [outgoing, ...old.prior]) {
    if (!layer.hasChildNodes()) continue;
    play(layer, [{ opacity: layer.style.opacity || "1" }, { opacity: 0 }], layer === outgoing ? duration : Math.min(100, duration));
    clip.append(layer);
  }
  // Keep the live SVG first for consumers querying the plot.
  plot.append(clip);

  if (!reduced && !old.interrupted && headline && oldMetric && oldMetric !== headline.textContent) {
    metric = rollMetric(headline, oldMetric, play);
  }

  const stop = () => {
    if (stopped) return;
    stopped = true;
    win.cancelAnimationFrame(frameId);
    finishTrace?.();
    for (const animation of animations) animation.cancel();
    animated.forEach(node => node.removeAttribute("data-horizon-moving"));
    cleanLine?.();
    metric?.();
    clip.remove();
    onFinish();
  };
  // The SVG trace and the browser-driven bars must use the same frame origin.
  start = win.performance.now();
  for (const animation of animations) animation.startTime = start;
  void Promise.allSettled([...animations.map(animation => animation.finished), traceDone]).then(stop);
  return stop;
}

function rollMetric(headline: HTMLElement, before: string, play: Play) {
  const after = headline.textContent ?? "";
  const digits = before.match(/\p{Nd}/gu) ?? [];
  const next = after.match(/\p{Nd}/gu) ?? [];
  const visual = document.createElement("span");
  visual.setAttribute("aria-hidden", "true");
  let i = digits.length - next.length;
  for (const char of after) {
    const prior = /\p{Nd}/u.test(char) ? digits[i++] : undefined;
    if (!prior || prior === char) { visual.append(char); continue; }
    const slot = document.createElement("span");
    slot.className = "viz-horizon-digit";
    const reel = document.createElement("span");
    const oldDigit = document.createElement("span"), newDigit = document.createElement("span");
    oldDigit.textContent = prior;
    newDigit.textContent = char;
    reel.append(oldDigit, newDigit);
    slot.append(reel);
    visual.append(slot);
    play(reel, [{ transform: "translateY(0)" }, { transform: "translateY(-50%)" }], 160, fadeEase);
  }
  const accessible = document.createElement("span");
  accessible.className = "viz-sr-only";
  accessible.textContent = after;
  headline.replaceChildren(accessible, visual);
  return () => { headline.textContent = after; };
}
