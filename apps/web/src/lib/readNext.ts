export type ReadNext = {
  score: number;
  tier: string;
  best_format: string | null;
  hold_ratio: number | null;
  reasons: string[];
};

export function compareReadNext(
  a: { title: string; author?: string | null; shelf_item_id?: string; read_next?: ReadNext },
  b: { title: string; author?: string | null; shelf_item_id?: string; read_next?: ReadNext },
) {
  const sa = a.read_next?.score ?? -Infinity;
  const sb = b.read_next?.score ?? -Infinity;
  if (sa !== sb) return sb - sa; // desc

  const ta = (a.title ?? "").toLowerCase();
  const tb = (b.title ?? "").toLowerCase();
  if (ta < tb) return -1;
  if (ta > tb) return 1;

  const aa = (a.author ?? "").toLowerCase();
  const ab = (b.author ?? "").toLowerCase();
  if (aa < ab) return -1;
  if (aa > ab) return 1;

  const ida = a.shelf_item_id ?? "";
  const idb = b.shelf_item_id ?? "";
  if (ida < idb) return -1;
  if (ida > idb) return 1;

  return 0;
}

export function readNextTooltip(rn?: ReadNext) {
  if (!rn) return "No Read Next score";
  const lines = [`Score: ${rn.score.toFixed(1)}`, ...rn.reasons];
  return lines.join("\n");
}