import * as THREE from 'three';

const std = (color: number, roughness = 0.6, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

export const paint = (color: number) =>
  new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.32,
    metalness: 0.35,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
  });

export const MAT = {
  black: std(0x16181c, 0.55),
  trim: std(0x24282f, 0.45, 0.1),
  plastic: std(0x2c3038, 0.7),
  dash: std(0x2a2e35, 0.75),
  dashSoft: std(0x3a3f48, 0.85),
  leather: std(0x30343c, 0.8),
  seat: std(0x3b404a, 0.9),
  fabric: std(0x5a606b, 0.95),
  liner: std(0xbfc3c8, 0.95),
  carpet: std(0x23262b, 1),
  chrome: std(0xdfe4ea, 0.12, 1),
  alloy: std(0xc8cdd4, 0.28, 0.9),
  darkAlloy: std(0x6f757d, 0.35, 0.8),
  disc: std(0x8b9097, 0.38, 0.85),
  rubber: std(0x1c1d20, 0.92),
  tread: std(0x26272b, 0.95),
  caliper: std(0xd23b2b, 0.4, 0.2),
  pad: std(0x5a4636, 0.9),
  backing: std(0x9aa0a6, 0.4, 0.8),
  engine: std(0x3b3f45, 0.55, 0.4),
  engineCover: std(0x1f2226, 0.5, 0.1),
  yellow: std(0xf5c518, 0.45),
  blueCap: std(0x2f7de1, 0.45),
  reservoir: new THREE.MeshPhysicalMaterial({ color: 0xf2f2ee, roughness: 0.35, transmission: 0.2, transparent: true, opacity: 0.75 }),
  coolantFluid: std(0xff5fa2, 0.3, 0, { emissive: 0x551030, emissiveIntensity: 0.4 }),
  washerFluid: std(0x3aa5ff, 0.3, 0, { emissive: 0x0a2a55, emissiveIntensity: 0.4 }),
  brakeFluid: std(0xd9b44a, 0.3),
  plate: std(0xf4f4ef, 0.5),
  glass: new THREE.MeshPhysicalMaterial({
    color: 0x0c131c,
    roughness: 0.04,
    metalness: 0.1,
    transparent: true,
    opacity: 0.72,
    envMapIntensity: 1.6,
  }),
  gloss: new THREE.MeshPhysicalMaterial({ color: 0x0b0d10, roughness: 0.22, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.08 }),
  lampHousing: new THREE.MeshPhysicalMaterial({ color: 0x15181d, roughness: 0.15, metalness: 0.6, clearcoat: 1, clearcoatRoughness: 0.05 }),
  tailHousing: new THREE.MeshPhysicalMaterial({ color: 0x2a0606, roughness: 0.15, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05 }),
  wellLiner: new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.95, side: THREE.DoubleSide }),
  bayFloor: new THREE.MeshStandardMaterial({ color: 0x1d2024, roughness: 0.8 }),
  windshieldInner: new THREE.MeshBasicMaterial({ color: 0x9fc4e8, transparent: true, opacity: 0.06, depthWrite: false }),
  ghost: new THREE.MeshStandardMaterial({
    color: 0x9cc6ff,
    transparent: true,
    opacity: 0.1,
    depthWrite: false,
    roughness: 0.4,
  }),
  skin: std(0xf0c4a2, 0.75),
  shirt: std(0x4f78e0, 0.85),
  pants: std(0x2b3346, 0.9),
  shoe: std(0xe4e7ec, 0.6),
  hair: std(0x2a211c, 0.9),
  belt: std(0x22252b, 0.8),
  beltHi: std(0x2f3b52, 0.7),
  buckle: std(0xb9bec6, 0.3, 0.8),
  redBtn: std(0xe0302a, 0.4, 0, { emissive: 0x500000, emissiveIntensity: 0.2 }),
  concrete: std(0xb7b9bb, 0.92),
};

export const lampMat = (color: number, emissive: number) =>
  new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: 0.05, roughness: 0.2, metalness: 0.1 });

export const glowMat = (color: number, opacity = 1) =>
  new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, toneMapped: false });
