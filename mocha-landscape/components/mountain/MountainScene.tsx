"use client";

import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { useReducedMotion } from "framer-motion";
import { landscape } from "@/lib/landscape";
import {
  canUseWebGL,
  decimateTerrain,
  loadTerrain,
  prefersStaticLandscape,
  type TerrainField,
} from "@/lib/terrain";
import { FallbackLandscape } from "./FallbackLandscape";
import { MountainParticles } from "./MountainParticles";
import { SnowfallSystem } from "./SnowfallSystem";

type Props = {
  variant?: "hero" | "quiet";
  className?: string;
};

function useTerrainField(enabled: boolean) {
  const [field, setField] = useState<TerrainField | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancel = false;
    loadTerrain()
      .then((next) => {
        if (!cancel) setField(next);
      })
      .catch(() => {
        if (!cancel) setFailed(true);
      });
    return () => {
      cancel = true;
    };
  }, [enabled]);

  return { field, failed };
}

function useInView(active: boolean) {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(active);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const onVisibility = () => setVisible(document.visibilityState === "visible");
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { rootMargin: "120px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  return { setNode, playing: inView && visible };
}

class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { error: boolean }> {
  state = { error: false };

  static getDerivedStateFromError() {
    return { error: true };
  }

  render() {
    return this.state.error ? this.props.fallback : this.props.children;
  }
}

export function MountainScene({ variant = "hero", className }: Props) {
  const reduced = useReducedMotion() ?? false;
  const quiet = variant === "quiet";
  const { setNode, playing } = useInView(variant === "hero");
  const [webgl, setWebgl] = useState<boolean | null>(null);

  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    landscape.finePointer = fine;
    setWebgl(canUseWebGL() && !prefersStaticLandscape());
  }, []);

  const { field, failed } = useTerrainField(webgl !== null);
  const narrow = useNarrow();
  const drawn = useMemo(() => {
    if (!field) return null;
    const ratio = narrow ? 0.48 : quiet ? 0.72 : 1;
    return decimateTerrain(field, ratio);
  }, [field, narrow, quiet]);

  const showFallback = webgl === false || failed;

  return (
    <div ref={setNode} className={className} aria-hidden="true">
      {showFallback ? (
        <FallbackLandscape field={field} quiet={quiet} reduced={reduced} />
      ) : drawn ? (
        <SceneBoundary fallback={<FallbackLandscape field={drawn} quiet={quiet} reduced={reduced} />}>
          <Canvas
            dpr={[1, 1.5]}
            frameloop={playing ? "always" : "never"}
            gl={{
              alpha: true,
              antialias: false,
              powerPreference: "high-performance",
              premultipliedAlpha: true,
            }}
            camera={{ position: [0, 0, 6], fov: 42, near: 0.1, far: 40 }}
            style={{ width: "100%", height: "100%", pointerEvents: "none" }}
            onCreated={({ gl }) => {
              gl.setClearColor(0x000000, 0);
            }}
          >
            <MountainParticles field={drawn} quiet={quiet} reduced={reduced} />
            {!quiet && !reduced ? (
              <>
                <SnowfallSystem count={narrow ? 70 : 180} far reduced={reduced} />
                <SnowfallSystem count={narrow ? 90 : 260} reduced={reduced} />
              </>
            ) : null}
          </Canvas>
        </SceneBoundary>
      ) : null}
    </div>
  );
}

function useNarrow() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const apply = () => setNarrow(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);
  return narrow;
}
