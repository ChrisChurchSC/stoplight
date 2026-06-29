import { useTrafficStore } from '../store/useTrafficStore'

/**
 * "New canvas" — the hub's create action, kept top-right so starting fresh is
 * never buried. A canvas isn't tied to a brand: this opens a fresh Untitled canvas
 * in the Drafts space instantly (Figma-style), and you attach a brand later via
 * the Brand card on the canvas.
 */
export function NewCanvasButton() {
  const createCanvas = useTrafficStore((s) => s.createCanvas)
  return (
    <button className="hub-new" onClick={createCanvas} title="Open a fresh blank canvas">
      ＋ New canvas
    </button>
  )
}
