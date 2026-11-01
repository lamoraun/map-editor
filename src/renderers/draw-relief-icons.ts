import type { ReliefIcon } from "@/generators/relief-generator";
import { Scene, ViewportLayers, type ViewportRenderContext } from "@/renderers/viewport/viewport-renderer";

interface ReliefSceneIcon {
  id: string;
  data: ReliefIcon;
}

const scene = new Scene<ReliefSceneIcon>();
const layer = ViewportLayers.register({ id: "relief", render: reconcileRelief });
let frameId: number | null = null;

export const drawRelief = (): void => {
  const isActive = layerIsOn("toggleRelief");
  setReliefLayerActive(isActive);
  if (!isActive) return void removeRelief();

  TIME && console.time("drawRelief");
  if (!pack.relief?.length) Relief.generate();
  scene.replace(pack.relief.map((data, i) => ({ id: String(i), data })));
  // data changed (load / regenerate / edit): drop materialized icons so the
  // reconcile below rebuilds them at their fresh positions. Scroll-time
  // reconciles stay incremental and skip this path.
  document.querySelector("#terrain")?.replaceChildren();
  layer.render();
  TIME && console.timeEnd("drawRelief");
};

export const redrawRelief = (): void => {
  if (frameId !== null) return;
  frameId = requestAnimationFrame(() => {
    frameId = null;
    drawRelief();
  });
};

export const getSceneReliefIcon = (id: string): ReliefIcon | undefined => scene.get(id)?.data;

function removeRelief(): void {
  scene.invalidate();
  document.querySelector("#terrain")?.replaceChildren();
}

export const setReliefLayerActive = (isActive: boolean): void => {
  const terrainEl = document.querySelector<SVGAElement>("#terrain");
  if (!terrainEl) return;
  terrainEl.style.display = isActive ? "" : "none";
  if (!terrainEl.getAttribute("style")) terrainEl.removeAttribute("style");
};

function reconcileRelief(context: ViewportRenderContext): void {
  const terrain = context.root.querySelector<SVGGElement>("#terrain");
  if (!terrain) return;
  if (!scene.valid || !layerIsOn("toggleRelief")) return void terrain.replaceChildren();

  const { x0, y0, x1, y1 } = context.bounds;

  // Incremental materialization: only append icons entering the viewport and
  // remove those leaving it. Rebuilding the whole layer via innerHTML on every
  // pan/zoom frame was the main scroll hitch and the source of the grey flashes.
  const materialized = new Set<number>();
  for (const child of Array.from(terrain.children)) {
    const id = Number((child as SVGElement).dataset.id);
    if (!Number.isNaN(id)) materialized.add(id);
  }

  const wanted = new Set<number>();
  const fragment = document.createDocumentFragment();

  for (const { id, data } of scene.values()) {
    const { icon, x, y, s } = data;
    if (x > x1 || y > y1 || x + s < x0 || y + s < y0) continue;

    const numId = Number(id);
    wanted.add(numId);
    if (materialized.has(numId)) continue;

    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", `#${icon}`);
    use.setAttribute("data-id", id);
    use.setAttribute("x", String(x));
    use.setAttribute("y", String(y));
    use.setAttribute("width", String(s));
    use.setAttribute("height", String(s));
    fragment.appendChild(use);
  }

  if (fragment.childNodes.length) terrain.appendChild(fragment);

  for (const child of Array.from(terrain.children)) {
    if (!wanted.has(Number((child as SVGElement).dataset.id))) child.remove();
  }
}

window.drawRelief = drawRelief;
window.redrawRelief = redrawRelief;
