"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { landscape } from "@/lib/landscape";
import type { TerrainField } from "@/lib/terrain";
import { mountainFragment, mountainVertex } from "./shaders";

type Props = {
  field: TerrainField;
  quiet?: boolean;
  reduced: boolean;
  /** Full first screen: the range fills the frame and drifts behind the headline. */
  banner?: boolean;
};

export function MountainParticles({ field, quiet = false, reduced, banner = false }: Props) {
  const material = useRef<THREE.ShaderMaterial>(null);
  const reveal = useRef(reduced ? 1 : 0);
  const strength = useRef(0);
  const focus = useRef(0);
  const energy = useRef(0);
  const pulse = useRef(0);
  const pointer = useRef(new THREE.Vector2(0, 0.4));
  const { viewport, size } = useThree();

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(field.position, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(field.size, 1));
    geo.setAttribute("aAlpha", new THREE.BufferAttribute(field.alpha, 1));
    geo.setAttribute("aSquare", new THREE.BufferAttribute(field.square, 1));
    geo.setAttribute("aRidge", new THREE.BufferAttribute(field.ridge, 1));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(field.seed, 1));
    geo.computeBoundingSphere();
    return geo;
  }, [field]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uReveal: { value: reduced ? 1 : 0 },
      uPlane: { value: new THREE.Vector2(8, 3) },
      uAnchor: { value: -1 },
      uPointer: { value: new THREE.Vector2() },
      uPointerStrength: { value: 0 },
      uReduced: { value: reduced ? 1 : 0 },
      uSizeScale: { value: 1 },
      uEnergy: { value: 0 },
      uFocus: { value: 0 },
      uPulse: { value: 0 },
      uQuiet: { value: quiet ? 1 : 0 },
      uDrift: { value: 0 },
    }),
    [quiet, reduced],
  );

  useLayoutEffect(() => {
    return () => geometry.dispose();
  }, [geometry]);

  useFrame((state, delta) => {
    const mat = material.current;
    if (!mat) return;
    const dt = Math.min(delta, 0.05);
    const narrow = size.width < 760;
    const boost = narrow ? 1.08 : quiet ? 1.04 : 1.02;
    let planeW = viewport.width * boost;
    let planeH = planeW / (field.sourceWidth / field.sourceHeight);
    if (narrow && !banner) planeH *= 1.45;
    let anchor = -viewport.height / 2 + planeH / 2 - viewport.height * (narrow ? 0.035 : 0.018);
    if (banner) {
      // Match the original study: full width, both peaks, centered in the hero frame.
      planeW = viewport.width * 1.02;
      planeH = planeW / (field.sourceWidth / field.sourceHeight);
      if (planeH < viewport.height * 0.92) {
        const scale = Math.min((viewport.height * 0.96) / planeH, narrow ? 1.65 : 1.04);
        planeW *= scale;
        planeH *= scale;
      }
      anchor = 0;
    }

    reveal.current = reduced
      ? 1
      : reveal.current + (1 - reveal.current) * (1 - Math.exp(-dt * 1.05));

    const follow = 1 - Math.exp(-dt * 3.4);
    strength.current += (landscape.strengthTarget - strength.current) * follow;
    focus.current += (landscape.focusTarget - focus.current) * (1 - Math.exp(-dt * 4));
    energy.current += (landscape.energyTarget - energy.current) * (1 - Math.exp(-dt * 2.2));
    if (!quiet && landscape.pulse > pulse.current) pulse.current = landscape.pulse;
    if (!quiet) landscape.pulse = 0;
    pulse.current *= Math.exp(-dt * 1.15);

    const worldX = landscape.nx * viewport.width * 0.5;
    const worldY = landscape.ny * viewport.height * 0.5;
    pointer.current.x += (worldX - pointer.current.x) * (1 - Math.exp(-dt * 5));
    pointer.current.y += (worldY - pointer.current.y) * (1 - Math.exp(-dt * 5));

    const fit = size.width / field.sourceWidth;
    const sizeScale =
      Math.max(fit, narrow ? 0.5 : 0.48) *
      Math.min(state.gl.getPixelRatio(), 1.5) *
      (narrow ? 1.35 : banner ? 1.85 : 1.7);
    const drift = banner && !reduced ? Math.sin(state.clock.elapsedTime * 0.16) * viewport.width * 0.028 : 0;

    mat.uniforms.uTime.value += dt * (quiet ? 0.65 : 1);
    mat.uniforms.uReveal.value = reveal.current;
    mat.uniforms.uPlane.value.set(planeW, planeH);
    mat.uniforms.uAnchor.value = anchor;
    mat.uniforms.uPointer.value.copy(pointer.current);
    mat.uniforms.uPointerStrength.value = quiet ? 0 : strength.current;
    mat.uniforms.uReduced.value = reduced ? 1 : 0;
    mat.uniforms.uSizeScale.value = sizeScale;
    mat.uniforms.uEnergy.value = energy.current;
    mat.uniforms.uFocus.value = focus.current;
    mat.uniforms.uPulse.value = pulse.current;
    mat.uniforms.uQuiet.value = quiet ? 1 : 0;
    mat.uniforms.uDrift.value = drift;
  });

  return (
    <points geometry={geometry} frustumCulled={false} renderOrder={1}>
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={mountainVertex}
        fragmentShader={mountainFragment}
        transparent
        premultipliedAlpha
        depthWrite={false}
        depthTest={false}
        toneMapped={false}
      />
    </points>
  );
}
