"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { landscape } from "@/lib/landscape";
import { snowFragment, snowVertex } from "./shaders";

type Props = {
  count: number;
  far?: boolean;
  reduced: boolean;
};

function createSnow(count: number, far: boolean) {
  const position = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  const speed = new Float32Array(count);
  const drift = new Float32Array(count);
  const size = new Float32Array(count);
  const depth = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const s = Math.random();
    position[i * 3] = Math.random() * 2 - 1;
    position[i * 3 + 1] = 0;
    position[i * 3 + 2] = 0;
    seed[i] = Math.random();
    speed[i] = far ? 0.035 + Math.random() * 0.04 : 0.07 + Math.random() * 0.09;
    drift[i] = (Math.random() - 0.5) * (far ? 0.035 : 0.07);
    size[i] = far ? 1.4 + Math.random() * 1.3 : 1.8 + Math.random() * 2.1;
    depth[i] = far ? Math.random() * 0.45 : 0.55 + Math.random() * 0.45;
    if (s > 0.92 && !far) size[i] += 1.1;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  geometry.setAttribute("aSpeed", new THREE.BufferAttribute(speed, 1));
  geometry.setAttribute("aDrift", new THREE.BufferAttribute(drift, 1));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  geometry.setAttribute("aDepth", new THREE.BufferAttribute(depth, 1));
  return geometry;
}

export function SnowfallSystem({ count, far = false, reduced }: Props) {
  const material = useRef<THREE.ShaderMaterial>(null);
  const wind = useRef(0);
  const { viewport, size } = useThree();
  const geometry = useMemo(() => createSnow(count, far), [count, far]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: Math.random() * 10 },
      uView: { value: new THREE.Vector2(8, 5) },
      uWind: { value: new THREE.Vector2() },
      uReduced: { value: reduced ? 1 : 0 },
      uReveal: { value: reduced ? 1 : 0 },
      uSizeScale: { value: 1 },
      uFar: { value: far ? -0.55 : 0.2 },
    }),
    [far, reduced],
  );

  useLayoutEffect(() => {
    return () => geometry.dispose();
  }, [geometry]);

  useFrame((state, delta) => {
    const mat = material.current;
    if (!mat) return;
    const dt = Math.min(delta, 0.05);
    const age = Math.max(0, (performance.now() - landscape.windAt) / 1000);
    const gust = landscape.windX * Math.exp(-age * 1.5);
    const ambient = Math.sin(state.clock.elapsedTime * 0.13) * 0.06;
    wind.current += (gust + ambient - wind.current) * (1 - Math.exp(-dt * 2.2));

    const revealUniform = mat.uniforms.uReveal.value as number;
    mat.uniforms.uTime.value += dt;
    mat.uniforms.uView.value.set(viewport.width, viewport.height);
    mat.uniforms.uWind.value.set(reduced ? ambient * 0.2 : wind.current, 0);
    mat.uniforms.uReduced.value = reduced ? 1 : 0;
    mat.uniforms.uReveal.value = reduced ? 1 : Math.min(1, revealUniform + dt * 0.45);
    mat.uniforms.uSizeScale.value = Math.min(state.gl.getPixelRatio(), 1.6) * (size.width < 760 ? 0.9 : 1);
  });

  return (
    <points geometry={geometry} frustumCulled={false} renderOrder={far ? 0 : 2}>
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={snowVertex}
        fragmentShader={snowFragment}
        transparent
        premultipliedAlpha
        depthWrite={false}
        depthTest={false}
        toneMapped={false}
      />
    </points>
  );
}
