export const mountainVertex = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute float aSquare;
attribute float aRidge;
attribute float aSeed;

uniform float uTime;
uniform float uReveal;
uniform vec2 uPlane;
uniform float uAnchor;
uniform vec2 uPointer;
uniform float uPointerStrength;
uniform float uReduced;
uniform float uSizeScale;
uniform float uEnergy;
uniform float uFocus;
uniform float uPulse;
uniform float uQuiet;
uniform float uDrift;

varying float vAlpha;
varying float vSquare;

void main() {
  float reduced = step(0.5, uReduced);
  vec2 uv = position.xy;
  float depth = position.z;

  float x = (uv.x - 0.5) * uPlane.x + uDrift;
  float y = (0.5 - uv.y) * uPlane.y + uAnchor;
  vec3 pos = vec3(x, y, mix(-0.15, 0.9, depth));

  float crest = mix(0.35, 1.0, aRidge);
  float waveA = sin(x * 0.62 + uTime * 0.28 + aSeed * 6.28318);
  float waveB = sin(x * 1.35 - uTime * 0.17 + depth * 5.0 + aSeed * 3.1);
  float wave = waveA * 0.65 + waveB * 0.35;
  float amp = (0.0035 + aRidge * 0.012) * uPlane.y;
  amp *= mix(1.0, 1.22, uEnergy) * mix(1.0, 0.7, uFocus) * mix(1.0, 0.45, uQuiet);
  amp *= (1.0 - reduced);
  pos.y += wave * amp;
  pos.x += cos(uTime * 0.15 + aSeed * 6.28318 + depth * 2.0) * amp * 0.28;

  float pulse = uPulse * (1.0 - reduced) * (1.0 - uQuiet);
  pos.y += pulse * crest * sin(x * 2.4 + aSeed * 6.28318) * uPlane.y * 0.012;

  float delay = (1.0 - depth) * 0.34 + uv.x * 0.1 + (1.0 - aRidge) * 0.08;
  float reveal = smoothstep(delay, delay + 0.48, uReveal);
  reveal = mix(reveal, 1.0, reduced);
  float scatter = 1.0 - reveal;
  float ang = aSeed * 6.28318;
  pos.x += cos(ang) * scatter * uPlane.x * 0.045;
  pos.y += (0.55 + sin(ang) * 0.45) * scatter * uPlane.y * 0.22;

  vec2 delta = pos.xy - uPointer;
  float dist = length(delta);
  float influence = exp(-dist * dist * 1.65) * uPointerStrength * (1.0 - reduced);
  vec2 dir = delta / (dist + 0.0015);
  pos.xy += dir * influence * 0.28;
  pos.y += influence * aRidge * 0.05;

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  float size = max(aSize * uSizeScale, 1.15);
  gl_PointSize = size;

  float breathe = 1.0 - reduced * 0.0;
  float flicker = 1.0 - aRidge * 0.07 * (0.5 + 0.5 * sin(uTime * 0.65 + aSeed * 14.0)) * breathe * (1.0 - reduced);
  vAlpha = aAlpha * reveal * flicker * mix(1.0, 0.92, uQuiet);
  vSquare = aSquare;
}
`;

export const mountainFragment = /* glsl */ `
precision highp float;

varying float vAlpha;
varying float vSquare;

void main() {
  vec2 p = gl_PointCoord - vec2(0.5);
  float circle = length(p);
  float box = max(abs(p.x), abs(p.y));
  float d = mix(circle, box, vSquare);
  float edge = fwidth(d);
  float mask = 1.0 - smoothstep(0.4 - edge, 0.5, d);
  if (mask < 0.04) discard;
  float alpha = mask * vAlpha;
  gl_FragColor = vec4(vec3(alpha), alpha);
}
`;

export const snowVertex = /* glsl */ `
attribute float aSeed;
attribute float aSpeed;
attribute float aDrift;
attribute float aSize;
attribute float aDepth;

uniform float uTime;
uniform vec2 uView;
uniform vec2 uWind;
uniform float uReduced;
uniform float uReveal;
uniform float uSizeScale;
uniform float uFar;

varying float vAlpha;
varying float vStretch;

void main() {
  float reduced = step(0.5, uReduced);
  float t = uTime * mix(aSpeed, aSpeed * 0.15, reduced) + aSeed;
  float fall = fract(t);
  float x = position.x * uView.x * 0.58;
  x += sin(uTime * 0.23 + aSeed * 6.28318) * aDrift * uView.x;
  x += uWind.x * uView.x * (0.35 + aDepth * 0.9) * (1.0 - reduced);
  float y = uView.y * 0.56 - fall * uView.y * 1.18;
  float z = mix(uFar, 1.15, aDepth);

  vec4 mvPosition = modelViewMatrix * vec4(x, y, z, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = max(aSize * uSizeScale, 1.2);

  float appear = smoothstep(0.42, 0.78, uReveal);
  appear = mix(appear, 1.0, reduced);
  float fade = smoothstep(0.0, 0.08, fall) * (1.0 - smoothstep(0.9, 1.0, fall));
  vAlpha = appear * fade * mix(0.28, 0.85, aDepth);
  vStretch = mix(1.6, 3.4, aSpeed) * mix(1.0, 0.4, reduced);
}
`;

export const snowFragment = /* glsl */ `
precision highp float;

varying float vAlpha;
varying float vStretch;

void main() {
  vec2 p = gl_PointCoord - vec2(0.5);
  p.y /= vStretch;
  float d = length(p);
  float head = 1.0 - smoothstep(0.16, 0.34, d);
  float trail = exp(-abs(gl_PointCoord.y - 0.32) * 7.0) * (1.0 - smoothstep(0.08, 0.22, abs(p.x)));
  trail *= smoothstep(0.15, 0.55, gl_PointCoord.y);
  float mask = max(head, trail * 0.55);
  if (mask < 0.04) discard;
  float alpha = mask * vAlpha;
  gl_FragColor = vec4(vec3(alpha), alpha);
}
`;
