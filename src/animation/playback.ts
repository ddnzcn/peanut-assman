import { useEffect, useRef } from "react";
import type { AnimatedTileAsset, AnimationFrame } from "../types"; 
export function getTotalDuration(frames: AnimationFrame[]): number {
  return frames.reduce((sum, f) => sum + f.durationMs, 0); 
}

export function getFrameAtTime(frames: AnimationFrame[], timeMs: number, loop: boolean): number {
  if (!frames.length) {
    return 0; 
  }

  const total = getTotalDuration(frames); 

  if (total <= 0) {
    return 0;
  }
  const t = loop ? timeMs % total : Math.min(timeMs, total - 1);
  let elapsed = 0;
  for (let i = 0; i < frames.length; i += 1) {
    elapsed += frames[i].durationMs;
    if (t < elapsed) {
      return i;
    }
  }
  return frames.length - 1;
}

export function buildAnimatedTileLookup(animatedTiles: AnimatedTileAsset[]): Map<number, AnimatedTileAsset> {
  const map = new Map<number, AnimatedTileAsset>();
  for (const anim of animatedTiles) {
    map.set(anim.baseTileId, anim);
  }
  return map;
}

export function resolveAnimatedTileSliceId(
  lookup: Map<number, AnimatedTileAsset>,
  tileId: number,
  timeMs: number,
): string | null {
  const anim = lookup.get(tileId);
  if (!anim || !anim.frames.length) {
    return null;
  }
  const total = anim.frames.reduce((sum, f) => sum + f.durationMs, 0);
  if (total <= 0) {
    return anim.frames[0].sliceId;
  }
  const t = timeMs % total;
  let elapsed = 0;
  for (const frame of anim.frames) {
    elapsed += frame.durationMs;
    if (t < elapsed) {
      return frame.sliceId;
    }
  }
  return anim.frames[anim.frames.length - 1].sliceId;
}

export function useAnimationPlayback(isPlaying: boolean, onTick: (timeMs: number) => void): void {
  const startTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      startTimeRef.current = null;
      return;
    }

    const tick = (now: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = now;
      }
      const elapsed = now - startTimeRef.current;
      onTickRef.current(elapsed);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      startTimeRef.current = null;
    };
  }, [isPlaying]);
}
