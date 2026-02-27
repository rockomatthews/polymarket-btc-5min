import fs from "node:fs";
import path from "node:path";

export type SpotSample = { ts: number; price: number };

export type LocalState = {
  spotHistory: SpotSample[];
};

const STATE_PATH = path.join(process.cwd(), "data", "state.json");

export function loadState(): LocalState {
  try {
    const raw = fs.readFileSync(STATE_PATH, "utf8");
    const j = JSON.parse(raw);
    return {
      spotHistory: Array.isArray(j?.spotHistory) ? j.spotHistory : [],
    };
  } catch {
    return { spotHistory: [] };
  }
}

export function saveState(s: LocalState) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2));
}

export function pushSpotSample(state: LocalState, sample: SpotSample) {
  const max = Number(process.env.SPOT_HISTORY_MAX || "600"); // ~10h at 60s polling
  const arr = state.spotHistory || [];
  arr.push(sample);

  const cutoffMs = Number(process.env.SPOT_HISTORY_WINDOW_MS || String(6 * 60 * 60 * 1000));
  const minTs = Date.now() - cutoffMs;

  const filtered = arr.filter((x) => x && typeof x.ts === "number" && x.ts >= minTs);
  const trimmed = filtered.slice(Math.max(0, filtered.length - max));

  state.spotHistory = trimmed;
}

export function spotReturnBps(state: LocalState, windowMs: number) {
  const now = Date.now();
  const target = now - windowMs;
  const arr = state.spotHistory || [];
  if (arr.length < 2) return null;

  const latest = arr[arr.length - 1];
  // find closest sample at/just before target
  let ref: SpotSample | null = null;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i].ts <= target) {
      ref = arr[i];
      break;
    }
  }
  if (!ref) return null;

  const ret = (latest.price - ref.price) / ref.price;
  return ret * 10000; // bps
}
