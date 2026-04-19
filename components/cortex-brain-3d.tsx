"use client";

import React, { useRef, useMemo, useCallback, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Line } from "@react-three/drei";
import * as THREE from "three";
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  BloomEffect,
  ChromaticAberrationEffect,
} from "postprocessing";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RegionData {
  id: string;
  name: string;
  short: string;
  color: [number, number, number];
  size: number;
  activation: number;
  phase: string;
}

interface PathwayData {
  a: string;
  b: string;
  isActive: boolean;
  strength: number;
}

interface CortexBrain3DProps {
  regions: RegionData[];
  pathways: PathwayData[];
  viewMode: string;
  selectedRegionId: string;
  onSelectRegion: (id: string) => void;
}

// ─── 3D Positions ─────────────────────────────────────────────────────────────

const REGION_POS_3D: Record<string, [number, number, number]> = {
  intake:       [-11,  3,   2],
  executive:    [  0,  8,  -2],
  systems:      [ 11,  3,  -2],
  monetization: [ 11, -4,   2],
  language:     [  0, -8,   0],
  memory:       [-10, -4,   2],
  diagnostic:   [-13,  0,  -3],
  creative:     [  6,  0,   4],
  governance:   [ -2,  2,   0],
  execution:    [  4, -10, -2],
};

const REGION_COLORS: Record<string, string> = {
  intake:       '#22d3ee',
  executive:    '#facc15',
  systems:      '#60a5fa',
  monetization: '#10b981',
  language:     '#a855f7',
  memory:       '#e2e8f0',
  diagnostic:   '#f87171',
  creative:     '#ec4899',
  governance:   '#ffffff',
  execution:    '#fb923c',
};

// ─── Curl-noise particle vertex shader ───────────────────────────────────────
// Full curl noise via permutation polynomials

const CURL_VERT = /* glsl */`
  precision highp float;

  attribute float aRegion;    // 0..9 which region this particle belongs to
  attribute float aPhase;
  attribute float aSpeed;
  attribute vec3  aHome;      // home position in local space (offset from origin)

  uniform float uTime;
  uniform float uActivations[10]; // activation per region
  uniform float uSelected;        // selected region index (-1 = none)

  varying vec3  vColor;
  varying float vBright;
  varying float vAlpha;

  // ── Permutation polynomial (Stefan Gustavson) ────────────────────────────
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289v(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289v(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }

  // ── Simplex 3D noise ─────────────────────────────────────────────────────
  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 =   v - i + dot(i, C.xxx);

    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min( g.xyz, l.zxy );
    vec3 i2 = max( g.xyz, l.zxy );

    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;

    i = mod289(i);
    vec4 p = permute( permute( permute(
               i.z + vec4(0.0, i1.z, i2.z, 1.0))
             + i.y + vec4(0.0, i1.y, i2.y, 1.0))
             + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    float n_ = 0.142857142857;
    vec3  ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);

    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4( x.xy, y.xy );
    vec4 b1 = vec4( x.zw, y.zw );

    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;

    vec3 p0 = vec3(a0.xy,h.x);
    vec3 p1 = vec3(a0.zw,h.y);
    vec3 p2 = vec3(a1.xy,h.z);
    vec3 p3 = vec3(a1.zw,h.w);

    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  // ── Curl of a gradient field ──────────────────────────────────────────────
  vec3 curlNoise(vec3 p) {
    const float e = 0.1;
    vec3 dx = vec3(e, 0.0, 0.0);
    vec3 dy = vec3(0.0, e, 0.0);
    vec3 dz = vec3(0.0, 0.0, e);

    // Three independent scalar potentials via offset base (true divergence-free curl)
    vec3 p1 = p;
    vec3 p2 = p + vec3(31.416, 0.0, 0.0);
    vec3 p3 = p + vec3(0.0, 47.853, 0.0);

    float p1y = snoise(p1 + dy) - snoise(p1 - dy);
    float p1z = snoise(p1 + dz) - snoise(p1 - dz);
    float p2x = snoise(p2 + dx) - snoise(p2 - dx);
    float p2z = snoise(p2 + dz) - snoise(p2 - dz);
    float p3x = snoise(p3 + dx) - snoise(p3 - dx);
    float p3y = snoise(p3 + dy) - snoise(p3 - dy);

    return vec3(p3y - p2z, p1z - p3x, p2x - p1y) / (2.0 * e);
  }

  // ── Region colour palette ─────────────────────────────────────────────────
  vec3 regionColor(float idx) {
    int i = int(idx);
    if (i == 0) return vec3(0.133, 0.827, 0.933); // intake    cyan
    if (i == 1) return vec3(0.980, 0.800, 0.082); // executive yellow
    if (i == 2) return vec3(0.376, 0.647, 0.980); // systems   blue
    if (i == 3) return vec3(0.063, 0.725, 0.506); // monetization green
    if (i == 4) return vec3(0.659, 0.333, 0.969); // language  purple
    if (i == 5) return vec3(0.886, 0.910, 0.941); // memory    silver
    if (i == 6) return vec3(0.973, 0.443, 0.443); // diagnostic red
    if (i == 7) return vec3(0.925, 0.282, 0.600); // creative  pink
    if (i == 8) return vec3(1.0,   1.0,   1.0);   // governance white
    return       vec3(0.984, 0.573, 0.235);        // execution orange
  }

  float hash(float n) { return fract(sin(n) * 43758.5453); }

  void main() {
    int ri = int(aRegion);
    float activation = 0.0;
    if      (ri == 0) activation = uActivations[0];
    else if (ri == 1) activation = uActivations[1];
    else if (ri == 2) activation = uActivations[2];
    else if (ri == 3) activation = uActivations[3];
    else if (ri == 4) activation = uActivations[4];
    else if (ri == 5) activation = uActivations[5];
    else if (ri == 6) activation = uActivations[6];
    else if (ri == 7) activation = uActivations[7];
    else if (ri == 8) activation = uActivations[8];
    else              activation = uActivations[9];

    float t = uTime * aSpeed * 0.18;

    // Curl field sampled at home position displaced over time
    vec3 samplePos = aHome * 0.25 + vec3(t * 0.6, t * 0.45, t * 0.5);
    vec3 curl = curlNoise(samplePos);

    // Spring back to home
    float homeStr = 0.12 + (1.0 - activation) * 0.25;
    vec3 toHome = (aHome - position) * homeStr;

    // Combine: drift outward when highly active, spring back otherwise
    float driftMag = 1.8 + activation * 3.5;
    vec3 pos = aHome + curl * driftMag + toHome * 0.4;

    vColor = regionColor(aRegion);

    // Flicker — neural firing rhythm
    float flicker = 0.3 + 0.7 * pow(0.5 + 0.5 * sin(uTime * 6.5 * aSpeed + aPhase * 12.0), 2.5);
    float isSelected = step(abs(aRegion - uSelected), 0.5);
    float baseBright = 0.35 + activation * 0.75;
    vBright = flicker * baseBright * (1.0 + isSelected * 0.6);

    vAlpha = 0.35 + activation * 0.5 + isSelected * 0.15;

    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    float sizeMult = 0.5 + hash(aPhase * 5.77) * 1.0;
    gl_PointSize = sizeMult * (2.0 + activation * 2.0 + isSelected * 1.3) * (130.0 / -mvPos.z);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const CURL_FRAG = /* glsl */`
  precision highp float;
  varying vec3  vColor;
  varying float vBright;
  varying float vAlpha;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;

    float core = smoothstep(0.12, 0.0, d);
    float halo = 1.0 - smoothstep(0.08, 0.46, d);
    float shape = max(core * 0.9, halo * 0.12);

    // White-hot core on highly active particles
    vec3 col = mix(vColor, vec3(1.0), core * vBright * 0.7);

    gl_FragColor = vec4(col * vBright, shape * vAlpha);
  }
`;

// ─── Region ID → index ────────────────────────────────────────────────────────

const REGION_ORDER = [
  "intake", "executive", "systems", "monetization", "language",
  "memory", "diagnostic", "creative", "governance", "execution"
];

// ─── Curl-noise particle system (all 10 regions in one draw call) ─────────────

interface ParticleSystemProps {
  regions: RegionData[];
  selectedRegionId: string;
}

function ParticleSystem({ regions, selectedRegionId }: ParticleSystemProps) {
  const meshRef = useRef<THREE.Points>(null);
  const PARTICLES_PER_REGION = 2000; // 20k total
  const TOTAL = PARTICLES_PER_REGION * 10;

  const { geometry, material } = useMemo(() => {
    const positions   = new Float32Array(TOTAL * 3);
    const aHome       = new Float32Array(TOTAL * 3);
    const aRegion     = new Float32Array(TOTAL);
    const aPhase      = new Float32Array(TOTAL);
    const aSpeed      = new Float32Array(TOTAL);

    for (let ri = 0; ri < 10; ri++) {
      const regionId = REGION_ORDER[ri];
      const home = REGION_POS_3D[regionId] ?? [0, 0, 0];
      const spreadR = 2.4;

      for (let p = 0; p < PARTICLES_PER_REGION; p++) {
        const idx = ri * PARTICLES_PER_REGION + p;

        // Uniform sphere distribution
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const u = Math.random();
        const r = Math.pow(u, 0.4) * spreadR;

        const ox = r * Math.sin(phi) * Math.cos(theta);
        const oy = r * Math.sin(phi) * Math.sin(theta);
        const oz = r * Math.cos(phi) * 0.65;

        aHome[idx * 3]     = home[0] + ox;
        aHome[idx * 3 + 1] = home[1] + oy;
        aHome[idx * 3 + 2] = home[2] + oz;

        positions[idx * 3]     = aHome[idx * 3];
        positions[idx * 3 + 1] = aHome[idx * 3 + 1];
        positions[idx * 3 + 2] = aHome[idx * 3 + 2];

        aRegion[idx] = ri;
        aPhase[idx]  = Math.random() * Math.PI * 2;
        aSpeed[idx]  = 0.5 + Math.random() * 1.5;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aHome",    new THREE.BufferAttribute(aHome, 3));
    geo.setAttribute("aRegion",  new THREE.BufferAttribute(aRegion, 1));
    geo.setAttribute("aPhase",   new THREE.BufferAttribute(aPhase, 1));
    geo.setAttribute("aSpeed",   new THREE.BufferAttribute(aSpeed, 1));

    const mat = new THREE.ShaderMaterial({
      vertexShader: CURL_VERT,
      fragmentShader: CURL_FRAG,
      uniforms: {
        uTime:        { value: 0 },
        uActivations: { value: new Float32Array(10).fill(0.5) },
        uSelected:    { value: -1.0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    return { geometry: geo, material: mat };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const mat = meshRef.current.material as THREE.ShaderMaterial;
    mat.uniforms.uTime.value += delta;

    // Update activations
    const activs = mat.uniforms.uActivations.value as Float32Array;
    for (let i = 0; i < 10; i++) {
      const rid = REGION_ORDER[i];
      const region = regions.find((r) => r.id === rid);
      const target = region?.activation ?? 0.5;
      activs[i] = THREE.MathUtils.lerp(activs[i], target, delta * 2);
    }

    // Selected region index
    const selIdx = REGION_ORDER.indexOf(selectedRegionId);
    mat.uniforms.uSelected.value = THREE.MathUtils.lerp(
      mat.uniforms.uSelected.value,
      selIdx,
      delta * 8
    );
  });

  return <points ref={meshRef} geometry={geometry} material={material} />;
}

// ─── FakeGlowMaterial — ported from ektogamat/fake-glow-material-r3f (MIT) ───

const FAKE_GLOW_VERT = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vNormal   = normalize(normalMatrix * normal);
    vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FAKE_GLOW_FRAG = /* glsl */`
  uniform vec3  glowColor;
  uniform float glowIntensity;
  uniform float glowFalloff;

  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    vec3 viewDir = normalize(-vPosition);
    float rim = 1.0 - max(dot(viewDir, vNormal), 0.0);
    float glow = pow(rim, glowFalloff) * glowIntensity;
    gl_FragColor = vec4(glowColor * glow, glow * 0.85);
  }
`;

interface FakeGlowCoreProps {
  position: [number, number, number];
  color: string;
  intensity: number;
}

function FakeGlowCore({ position, color, intensity }: FakeGlowCoreProps) {
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(() => ({
    glowColor:     { value: new THREE.Color(color) },
    glowIntensity: { value: intensity },
    glowFalloff:   { value: 2.8 },
  }), [color, intensity]);

  useFrame((_, delta) => {
    if (!matRef.current) return;
    matRef.current.uniforms.glowIntensity.value = THREE.MathUtils.lerp(
      matRef.current.uniforms.glowIntensity.value,
      intensity,
      delta * 3
    );
  });

  return (
    <mesh position={position}>
      <sphereGeometry args={[0.55, 32, 32]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={FAKE_GLOW_VERT}
        fragmentShader={FAKE_GLOW_FRAG}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        side={THREE.FrontSide}
      />
    </mesh>
  );
}

// ─── Lightning bolt helpers ───────────────────────────────────────────────────

function generateLightningPoints(
  from: [number, number, number],
  to: [number, number, number],
  segments = 28,
  displacement = 0.9
): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  const start = new THREE.Vector3(...from);
  const end   = new THREE.Vector3(...to);

  points.push(start.clone());
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const base = start.clone().lerp(end, t);
    const noise = new THREE.Vector3(
      (Math.random() - 0.5) * displacement,
      (Math.random() - 0.5) * displacement,
      (Math.random() - 0.5) * displacement * 0.5
    );
    const envelope = Math.sin(t * Math.PI);
    points.push(base.add(noise.multiplyScalar(envelope)));
  }
  points.push(end.clone());
  return points;
}

function generateBranchPoints(
  mainPoints: THREE.Vector3[],
  branchStart: number,
  length: number,
  displacement: number
): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  pts.push(mainPoints[branchStart].clone());
  for (let i = 1; i <= length; i++) {
    const prev = pts[pts.length - 1].clone();
    pts.push(prev.add(new THREE.Vector3(
      (Math.random() - 0.5) * displacement,
      (Math.random() - 0.5) * displacement,
      (Math.random() - 0.5) * displacement * 0.4
    )));
  }
  return pts;
}

// ─── LightningBolt ────────────────────────────────────────────────────────────

interface LightningBoltProps {
  from: [number, number, number];
  to: [number, number, number];
  color: [number, number, number];
  strength: number;
}

function LightningBolt({ from, to, color, strength }: LightningBoltProps) {
  const timerRef    = useRef(0);
  const intervalRef = useRef(80 + Math.random() * 70);
  const [r, g, b]   = color;
  const hexColor    = useMemo(() => new THREE.Color(r / 255, g / 255, b / 255), [r, g, b]);

  const boltRef = useRef<{ main: THREE.Vector3[]; branches: THREE.Vector3[][] } | null>(null);
  const [, forceUpdate] = React.useReducer((x: number) => x + 1, 0);

  const regenerate = useCallback(() => {
    const main = generateLightningPoints(from, to, 30, 0.75);
    const b1   = generateBranchPoints(main, Math.floor(main.length * 0.3), 6, 0.55);
    const b2   = generateBranchPoints(main, Math.floor(main.length * 0.6), 5, 0.45);
    boltRef.current = { main, branches: [b1, b2] };
    forceUpdate();
  }, [from, to]);

  useEffect(() => { regenerate(); }, [regenerate]);

  useFrame((_, delta) => {
    timerRef.current += delta * 1000;
    if (timerRef.current > intervalRef.current) {
      timerRef.current = 0;
      intervalRef.current = 80 + Math.random() * 90;
      regenerate();
    }
  });

  if (!boltRef.current) return null;
  const { main, branches } = boltRef.current;
  const alpha   = 0.55 + (strength / 100) * 0.45;
  const mainPts = main.map((v) => [v.x, v.y, v.z] as [number, number, number]);

  return (
    <group>
      <Line points={mainPts} color={hexColor} lineWidth={7 + (strength / 100) * 6} transparent opacity={alpha * 0.35} />
      <Line points={mainPts} color={hexColor} lineWidth={3.5 + (strength / 100) * 2.5} transparent opacity={alpha * 0.55} />
      <Line points={mainPts} color={new THREE.Color(1, 1, 1)} lineWidth={1.6} transparent opacity={alpha * 0.95} />
      {branches.map((branch, bi) => {
        const bPts = branch.map((v) => [v.x, v.y, v.z] as [number, number, number]);
        return (
          <group key={bi}>
            <Line points={bPts} color={hexColor} lineWidth={3.5} transparent opacity={alpha * 0.3} />
            <Line points={bPts} color={new THREE.Color(1, 1, 1)} lineWidth={1.0} transparent opacity={alpha * 0.75} />
          </group>
        );
      })}
    </group>
  );
}

// ─── StormBackdrop ────────────────────────────────────────────────────────────

function StormBackdrop() {
  const flashRef   = useRef<THREE.Mesh>(null);
  const flashTimer = useRef(0);
  const nextFlash  = useRef(8 + Math.random() * 8);
  const flashActive = useRef(false);
  const flashAge   = useRef(0);

  const bgGeo = useMemo(() => {
    const count = 1200;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3]     = (Math.random() - 0.5) * 50;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 40;
      pos[i * 3 + 2] = -22 - Math.random() * 15;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return geo;
  }, []);

  useFrame((_, delta) => {
    flashTimer.current += delta;
    if (!flashActive.current && flashTimer.current > nextFlash.current) {
      flashActive.current = true;
      flashAge.current    = 0;
      flashTimer.current  = 0;
      nextFlash.current   = 8 + Math.random() * 10;
    }
    if (flashActive.current && flashRef.current) {
      flashAge.current += delta;
      const t = flashAge.current / 0.22;
      const curve = t < 0.4 ? t / 0.4 : 1 - (t - 0.4) / 0.6;
      (flashRef.current.material as THREE.MeshBasicMaterial).opacity = curve * 0.13;
      if (flashAge.current > 0.22) {
        flashActive.current = false;
        (flashRef.current.material as THREE.MeshBasicMaterial).opacity = 0;
      }
    }
  });

  return (
    <group>
      <points geometry={bgGeo}>
        <pointsMaterial color="#334466" size={0.06} transparent opacity={0.35} depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>
      <mesh ref={flashRef} position={[0, 0, -5]}>
        <planeGeometry args={[90, 70]} />
        <meshBasicMaterial color="#8899ff" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// ─── PostFX — raw postprocessing bloom + CA ───────────────────────────────────

function PostFX() {
  const { gl, scene, camera, size } = useThree();
  const composerRef = useRef<EffectComposer | null>(null);

  useEffect(() => {
    const composer = new EffectComposer(gl, {
      multisampling: 0,
      frameBufferType: THREE.HalfFloatType,
    });
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(
      new EffectPass(
        camera,
        new BloomEffect({
          intensity: 0.55,
          luminanceThreshold: 0.5,
          luminanceSmoothing: 0.1,
          mipmapBlur: true,
          radius: 0.85,
          levels: 8,
        }),
        new ChromaticAberrationEffect({ radialModulation: false, modulationOffset: 0,
          offset: new THREE.Vector2(0.0018, 0.0018),
        })
      )
    );
    composerRef.current = composer;
    return () => { composer.dispose(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl]);

  useEffect(() => {
    composerRef.current?.setSize(size.width, size.height);
  }, [size]);

  useFrame((_, delta) => {
    if (composerRef.current) {
      gl.autoClear = false;
      composerRef.current.render(delta);
    }
  }, 1);

  return null;
}

// ─── Inner scene ──────────────────────────────────────────────────────────────

interface SceneProps extends CortexBrain3DProps {}

function Scene({ regions, pathways, viewMode: _viewMode, selectedRegionId, onSelectRegion: _onSelectRegion }: SceneProps) {
  const regionMap = useMemo(
    () => Object.fromEntries(regions.map((r) => [r.id, r])),
    [regions]
  );

  const activePathways = useMemo(
    () => pathways.filter((p) => p.isActive),
    [pathways]
  );

  return (
    <>
      <color attach="background" args={["#02030a"]} />
      <fog attach="fog" args={["#02030a", 22, 60]} />
      <ambientLight intensity={0.15} />

      <OrbitControls
        enablePan={false}
        enableZoom={true}
        autoRotate={false}
        minDistance={6}
        maxDistance={28}
      />

      <StormBackdrop />

      {/* 20k curl-noise particles across all 10 regions */}
      <ParticleSystem regions={regions} selectedRegionId={selectedRegionId} />

      {/* Glow cores at each region center */}
      {REGION_ORDER.map((rid) => {
        const pos = REGION_POS_3D[rid];
        const region = regionMap[rid];
        if (!pos || !region) return null;
        const hexColor = REGION_COLORS[rid] ?? '#ffffff';
        return (
          <FakeGlowCore
            key={rid}
            position={pos}
            color={hexColor}
            intensity={region.activation * 0.8 + 0.08}
          />
        );
      })}

      {/* Lightning between active regions */}
      {activePathways.map((pathway, i) => {
        const ra = regionMap[pathway.a];
        const rb = regionMap[pathway.b];
        if (!ra || !rb) return null;
        const fromPos = REGION_POS_3D[pathway.a] ?? [0, 0, 0];
        const toPos   = REGION_POS_3D[pathway.b] ?? [0, 0, 0];
        const [r2, g2, b2] = ra.color;
        return (
          <LightningBolt
            key={`${pathway.a}-${pathway.b}-${i}`}
            from={fromPos}
            to={toPos}
            color={[r2, g2, b2]}
            strength={pathway.strength}
          />
        );
      })}

      <PostFX />
    </>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function CortexBrain3D(props: CortexBrain3DProps) {
  return (
    <Canvas
      camera={{ position: [0, 0, 42], fov: 52 }}
      gl={{ antialias: false, alpha: false, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.setClearColor(new THREE.Color("#02030a"), 1);
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.1;
      }}
      style={{ width: "100%", height: "100%" }}
      dpr={[1, 1.5]}
    >
      <Scene {...props} />
    </Canvas>
  );
}
