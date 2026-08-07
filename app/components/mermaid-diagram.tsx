/**
 * Mermaid.js diagram renderer with a fullscreen pan/zoom viewer.
 *
 * Renders ` ```mermaid ` code blocks to SVG on the client (mermaid needs a
 * DOM) and exposes a corner button that opens the diagram in a fullscreen
 * overlay for diagrams that are hard to read inline — mindmaps and large
 * graphs in particular — with drag-to-pan and scroll-to-zoom navigation.
 *
 * @module mermaid-diagram
 */

"use client";

import React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Maximize2, Minus, Plus, X } from "lucide-react";

// ---------------------------------------------------------------------------
// Lazy mermaid init — the library touches `document` at import time, so it
// must only ever load in the browser, not during SSR.
// ---------------------------------------------------------------------------

let mermaidModulePromise: Promise<typeof import("mermaid").default> | null = null;

function loadMermaid(): Promise<typeof import("mermaid").default> {
  if (!mermaidModulePromise) {
    mermaidModulePromise = import("mermaid").then((mod) => {
      const mermaid = mod.default;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        fontFamily: "var(--font-mono)",
        theme: "base",
        themeVariables: {
          background: "#1a1a2e",
          primaryColor: "#252538",
          primaryTextColor: "#ffffff",
          primaryBorderColor: "#3b82f6",
          secondaryColor: "#2f2f46",
          secondaryBorderColor: "#2e2e42",
          tertiaryColor: "#1f1f2e",
          tertiaryBorderColor: "#2e2e42",
          lineColor: "rgba(255, 255, 255, 0.45)",
          textColor: "#ffffff",
          mainBkg: "#252538",
          nodeBorder: "#3b82f6",
          clusterBkg: "#1f1f2e",
          clusterBorder: "#2e2e42",
          titleColor: "#ffffff",
          edgeLabelBackground: "#1f1f2e",
          nodeTextColor: "#ffffff",
          fontFamily: "var(--font-mono)",
        },
      });
      return mermaid;
    });
  }
  return mermaidModulePromise;
}

let diagramIdCounter = 0;

// ---------------------------------------------------------------------------
// MermaidDiagram
// ---------------------------------------------------------------------------

export interface MermaidDiagramProps {
  /** Raw mermaid diagram source from the fenced code block. */
  source: string;
}

export function MermaidDiagram({ source }: MermaidDiagramProps) {
  const [result, setResult] = React.useState<{ svg: string } | { error: string } | null>(null);
  const [fullscreen, setFullscreen] = React.useState(false);
  const idRef = React.useRef<string | undefined>(undefined);
  if (!idRef.current) {
    diagramIdCounter += 1;
    idRef.current = `mermaid-diagram-${diagramIdCounter}`;
  }

  React.useEffect(() => {
    let cancelled = false;
    setResult(null);
    loadMermaid()
      .then((mermaid) => mermaid.render(idRef.current!, source))
      .then(({ svg }) => {
        if (!cancelled) setResult({ svg });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setResult({ error: err instanceof Error ? err.message : String(err) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [source]);

  if (result && "error" in result) {
    return <div className="mermaid-error">Mermaid error: {result.error}</div>;
  }

  const svg = result && "svg" in result ? result.svg : null;

  return (
    <div className="mermaid-wrapper">
      {svg && (
        <button
          type="button"
          className="mermaid-expand-btn"
          aria-label="Expand diagram fullscreen"
          title="Expand fullscreen (Ctrl+F)"
          onClick={() => setFullscreen(true)}
        >
          <Maximize2 size={14} />
        </button>
      )}
      {svg ? (
        <div className="mermaid-diagram" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="mermaid-diagram mermaid-loading">Rendering diagram…</div>
      )}
      {fullscreen && svg && (
        <MermaidFullscreen svg={svg} onClose={() => setFullscreen(false)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fullscreen pan/zoom viewer
// ---------------------------------------------------------------------------

interface Transform {
  scale: number;
  x: number;
  y: number;
}

const MIN_SCALE = 0.15;
const MAX_SCALE = 8;

function MermaidFullscreen({ svg, onClose }: { svg: string; onClose: () => void }) {
  const [transform, setTransform] = React.useState<Transform>({ scale: 1, x: 0, y: 0 });
  // Radix's Dialog.Content mounts its portalled children on a commit *after*
  // this component's own effects run, so a plain `useRef` would still be
  // null the first (and only) time a `[]`-deps effect fires. A state-backed
  // callback ref re-renders once the node actually attaches, which is what
  // lets the wheel-listener effect below re-run and find a real element.
  const [viewportEl, setViewportEl] = React.useState<HTMLDivElement | null>(null);
  const [canvasEl, setCanvasEl] = React.useState<HTMLDivElement | null>(null);
  const dragRef = React.useRef({ dragging: false, startX: 0, startY: 0, origX: 0, origY: 0 });

  // Mermaid's SVG only has a `viewBox` plus a percentage `width` — with no
  // absolute intrinsic size, it collapses to 0×0 inside an auto-sized flex
  // container. Give it an explicit pixel size from its own viewBox so it has
  // something concrete to render (and zoom) at.
  React.useEffect(() => {
    const svgEl = canvasEl?.querySelector("svg");
    if (!svgEl) return;
    const box = svgEl.viewBox.baseVal;
    if (box.width > 0 && box.height > 0) {
      svgEl.style.width = `${box.width}px`;
      svgEl.style.height = `${box.height}px`;
      svgEl.style.maxWidth = "none";
    }
  }, [canvasEl]);

  // The canvas is centered in the viewport via flexbox, then offset by
  // `(x, y)` and scaled around its own center. So a screen point's local
  // offset from the *viewport center* is what stays fixed while zooming.
  const zoomAt = React.useCallback((factor: number, clientX?: number, clientY?: number) => {
    setTransform((t) => {
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, t.scale * factor));
      const rect = viewportEl?.getBoundingClientRect();
      if (!rect || clientX === undefined || clientY === undefined) {
        return { ...t, scale: newScale };
      }
      const cx = clientX - (rect.left + rect.width / 2);
      const cy = clientY - (rect.top + rect.height / 2);
      const ratio = newScale / t.scale;
      return { scale: newScale, x: cx - (cx - t.x) * ratio, y: cy - (cy - t.y) * ratio };
    });
  }, [viewportEl]);

  const reset = React.useCallback(() => setTransform({ scale: 1, x: 0, y: 0 }), []);

  // React attaches `onWheel` as a passive listener, so `preventDefault()`
  // inside it is silently ignored (and warns) — attach natively instead so
  // scrolling to zoom doesn't also scroll the page behind the dialog.
  React.useEffect(() => {
    if (!viewportEl) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      zoomAt(factor, e.clientX, e.clientY);
    };
    viewportEl.addEventListener("wheel", handler, { passive: false });
    return () => viewportEl.removeEventListener("wheel", handler);
  }, [viewportEl, zoomAt]);

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      origX: transform.x,
      origY: transform.y,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.dragging) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setTransform((t) => ({ ...t, x: dragRef.current.origX + dx, y: dragRef.current.origY + dy }));
  };

  const endDrag = (e: React.PointerEvent) => {
    dragRef.current.dragging = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <DialogPrimitive.Root open onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="mermaid-fs-overlay" />
        <DialogPrimitive.Content className="mermaid-fs-content" aria-describedby={undefined}>
          <DialogPrimitive.Title className="sr-only">Mermaid diagram</DialogPrimitive.Title>
          <div className="mermaid-fs-toolbar">
            <button type="button" onClick={() => zoomAt(1 / 1.25)} aria-label="Zoom out">
              <Minus size={16} />
            </button>
            <button type="button" onClick={reset} className="mermaid-fs-zoom-level" aria-label="Reset zoom">
              {Math.round(transform.scale * 100)}%
            </button>
            <button type="button" onClick={() => zoomAt(1.25)} aria-label="Zoom in">
              <Plus size={16} />
            </button>
            <DialogPrimitive.Close className="mermaid-fs-close" aria-label="Close">
              <X size={18} />
            </DialogPrimitive.Close>
          </div>
          <div
            ref={setViewportEl}
            className="mermaid-fs-viewport"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onDoubleClick={reset}
          >
            <div
              ref={setCanvasEl}
              className="mermaid-fs-canvas"
              style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </div>
          <p className="mermaid-fs-hint">Drag to pan · Scroll to zoom · Double-click to reset · Esc to close</p>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
