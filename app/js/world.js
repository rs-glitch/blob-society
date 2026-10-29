// 3D island world and the immediate-mode render API that every sim draws through.
// Sims call R.blob / R.prop / R.line / R.label / R.ring / R.field between R.begin() and R.end().
// Coordinates: sim world x in [0, BS.W], y in [0, 1] (same as the models); sizes in the same units.
// setBiome(name, seed) builds a seeded island: terrain, palette and scenery outside the flat play field.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const BS = window.BS;
const K = 6; // 3D units per sim unit
const MAX = { blob: 1200, tree: 200, pine: 200, bush: 200, rock: 200, food: 400, coin: 200, boat: 40, fish: 400, home: 400, ring: 600 };
const toX = x => (x - BS.W / 2) * K, toZ = y => (y - .5) * K;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mulberry = a => () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
function makeNoise(r) { // value noise, fbm in [0,1]
  const T = new Float32Array(4096); for (let i = 0; i < 4096; i++) T[i] = r();
  const v = (i, j) => T[(i & 63) | (j & 63) << 6];
  const n = (x, z) => { const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), w = fz * fz * (3 - 2 * fz); return (v(i, j) * (1 - u) + v(i + 1, j) * u) * (1 - w) + (v(i, j + 1) * (1 - u) + v(i + 1, j + 1) * u) * w; };
  return (x, z, o = 1) => { let s = 0, a = .5, f = 1, t = 0; for (let k = 0; k < o; k++) { s += a * n(x * f, z * f); t += a; a *= .5; f *= 2.03; } return s / t; };
}

// Biome palettes (light theme; dark is derived by darkening). amp/f = hill height and frequency.
const BIO = {
  meadow: { amp: .55, f: .2, rim: '#7dbb5b', rim2: '#6aab4f', mat: '#8fc46e', mat2: '#86bd66', edge: '#5d9446', sand: '#e8dba6', rock: '#9ba59d', fall: null },
  autumn: { amp: .6, f: .2, rim: '#b4a14a', rim2: '#a08c3e', mat: '#b2a65a', mat2: '#a99e52', edge: '#7a6c32', sand: '#e0cf96', rock: '#8f8478', fall: '#e8791f' },
  savannah: { amp: .4, f: .15, rim: '#d0b25e', rim2: '#bf9f4e', mat: '#c4ae6e', mat2: '#bba566', edge: '#8e7a40', sand: '#ecdcaa', rock: '#a39482', fall: null },
  hills: { amp: 1.5, f: .11, rim: '#6db35a', rim2: '#5aa04f', mat: '#85bd68', mat2: '#7cb461', edge: '#55883f', sand: '#e4d9a4', rock: '#9aa19a', fall: null },
  winter: { amp: .5, f: .2, rim: '#eef4f9', rim2: '#dde8f1', mat: '#bcd2e2', mat2: '#b3cadc', edge: '#8fa9bd', sand: '#dfeaf2', rock: '#8e9aa6', fall: '#ffffff' },
  foothills: { amp: 1.2, f: .13, rim: '#79a257', rim2: '#678f4c', mat: '#8bb26b', mat2: '#82a963', edge: '#5b7e42', sand: '#d9cfa0', rock: '#8c8f8e', fall: null },
  lake: { amp: .5, f: .17, rim: '#7eb55e', rim2: '#6ba456', mat: '#8fc46e', mat2: '#86bd66', edge: '#5d9446', sand: '#e6d9a3', rock: '#9aa39c', water: '#4f95aa', fall: null },
  village: { amp: .3, f: .18, rim: '#86b867', rim2: '#76a95b', mat: '#c4b48f', mat2: '#b6a584', edge: '#8b7a56', sand: '#e4d7a4', rock: '#9a9a96', path: '#d6c8a2', fall: null }
};

export function createWorld(canvas, labelLayer) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const FOV = 32, TAN = Math.tan(FOV * Math.PI / 360);
  const camera = new THREE.PerspectiveCamera(FOV, 1, .1, 200);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = .08; controls.enablePan = false; controls.rotateSpeed = .6; controls.zoomSpeed = .8;
  controls.minPolarAngle = .2; controls.maxPolarAngle = 1.22; controls.minAzimuthAngle = -1.1; controls.maxAzimuthAngle = 1.1;
  controls.target.set(0, 0, .15);
  let touched = false; controls.addEventListener('start', () => { touched = true; });
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const hemi = new THREE.HemisphereLight(0xfff4e0, 0x6a7c8a, 1.6), sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-4, 10, 6); scene.add(hemi, sun);
  const grad = new THREE.DataTexture(new Uint8Array([150, 196, 232, 255]), 4, 1, THREE.RedFormat); grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.needsUpdate = true;
  const toon = (o = {}) => new THREE.MeshToonMaterial({ gradientMap: grad, ...o });
  const U = { uTime: { value: 0 } };
  const inkC = new THREE.Color('#1b2733');

  // ---- colour cache (cleared on theme change; never mutate the returned colour)
  const cc = new Map();
  const C = k => { let c = cc.get(k); if (!c) { c = new THREE.Color(BS.col(k) || '#888'); cc.set(k, c); } return c; };

  // ---- shader patches
  const SWAY = 'varying vec3 vW;\n';
  function patchTint(m) { // instance colour only tints parts with tint=1
    m.onBeforeCompile = s => {
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute float tint;')
        .replace('#include <color_vertex>', '#include <color_vertex>\nvColor.rgb = mix(color.rgb, color.rgb * instanceColor.rgb, tint);');
    };
  }
  function patchSway(m) {
    m.onBeforeCompile = s => {
      s.uniforms.uTime = U.uTime;
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute float sway; uniform float uTime;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.x += sin(uTime * 1.3 + position.x * .9 + position.z * .7) * sway * .05; transformed.z += cos(uTime * 1.1 + position.x * .6 + position.z * .8) * sway * .035;');
    };
  }
  function patchWater(m) {
    m.onBeforeCompile = s => {
      s.uniforms.uTime = U.uTime;
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\n' + SWAY).replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = (modelMatrix * vec4(transformed, 1.)).xyz;');
      s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\n' + SWAY + 'uniform float uTime;')
        .replace('#include <color_fragment>', `#include <color_fragment>
float w1 = sin(vW.x * 2.1 + uTime * .9 + sin(vW.z * 1.3 + uTime * .5) * 1.5) * sin(vW.z * 2.3 - uTime * .7 + sin(vW.x * 1.1) * 1.7);
diffuseColor.rgb += vec3(.07, .09, .1) * smoothstep(.55, .92, w1);`);
    };
  }
  function patchHull(m) { // outline: push back faces out along the normal by ~0.011 world units
    m.onBeforeCompile = s => {
      s.vertexShader = s.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = position + normalize(normal) * max(.0055 / length(instanceMatrix[0].xyz), .035);');
    };
  }

  // ---- merged mesh templates: parts -> {pos, col, tint, sway}; tint=1 parts take the instance/item colour
  const cyl6 = new THREE.CylinderGeometry(1, 1, 1, 6), cyl3 = new THREE.CylinderGeometry(1, 1, 1, 3, 1, true), cone7 = new THREE.ConeGeometry(1, 1, 7), cone4 = new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4);
  const ico0 = new THREE.IcosahedronGeometry(1, 0), ico1 = new THREE.IcosahedronGeometry(1, 1), dod = new THREE.DodecahedronGeometry(1, 0), box = new THREE.BoxGeometry(1, 1, 1);
  const disc = n => new THREE.CircleGeometry(1, n).rotateX(-Math.PI / 2);
  const tmpCol = new THREE.Color();
  function mk(parts) {
    const pos = [], col = [], tint = [], sway = [];
    for (const [geo, color, o = {}] of parts) {
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      if (o.s) g.scale(...(Array.isArray(o.s) ? o.s : [o.s, o.s, o.s]));
      if (o.r) { g.rotateX(o.r[0]); g.rotateY(o.r[1]); g.rotateZ(o.r[2]); }
      if (o.p) g.translate(...o.p);
      const a = g.attributes.position, tn = color === 'tint';
      tmpCol.set(tn ? '#ffffff' : color);
      for (let i = 0; i < a.count; i++) { pos.push(a.getX(i), a.getY(i), a.getZ(i)); col.push(tmpCol.r, tmpCol.g, tmpCol.b); tint.push(tn ? 1 : 0); sway.push(o.w ? Math.max(0, a.getY(i)) * o.w : 0); }
    }
    return { pos: Float32Array.from(pos), col: Float32Array.from(col), tint: Float32Array.from(tint), sway: Float32Array.from(sway), n: pos.length / 3 };
  }
  function geoOf(t) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(t.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(t.col, 3)); g.setAttribute('tint', new THREE.BufferAttribute(t.tint, 1));
    g.computeVertexNormals(); return g;
  }
  const BROWN = '#7a5232', LEAF = '#4e9a45';
  const TP = {
    tree: mk([[cyl6, BROWN, { s: [.16, .85, .16], p: [0, .42, 0] }], [ico1, 'tint', { s: [1, .95, 1], p: [0, 1.6, 0], w: .25 }], [ico1, 'tint', { s: [.6, .55, .6], p: [.55, 1.15, .25], w: .2 }]]),
    pine: mk([[cyl6, BROWN, { s: [.14, .6, .14], p: [0, .3, 0] }], [cone7, 'tint', { s: [1, 1.05, 1], p: [0, .95, 0], w: .2 }], [cone7, 'tint', { s: [.78, .95, .78], p: [0, 1.55, 0], w: .3 }], [cone7, 'tint', { s: [.54, .85, .54], p: [0, 2.1, 0], w: .4 }]]),
    snowPine: mk([[cyl6, BROWN, { s: [.14, .6, .14], p: [0, .3, 0] }], [cone7, 'tint', { s: [1, 1.05, 1], p: [0, .95, 0], w: .2 }], [cone7, '#f4f9fc', { s: [.72, .6, .72], p: [0, 1.08, 0] }], [cone7, 'tint', { s: [.78, .95, .78], p: [0, 1.55, 0], w: .3 }], [cone7, '#f4f9fc', { s: [.56, .55, .56], p: [0, 1.68, 0] }], [cone7, 'tint', { s: [.54, .85, .54], p: [0, 2.1, 0], w: .4 }], [cone7, '#f4f9fc', { s: [.38, .5, .38], p: [0, 2.22, 0] }]]),
    acacia: mk([[cyl6, '#6b4a32', { s: [.12, 1.5, .12], p: [0, .75, 0], r: [0, 0, .1] }], [ico1, 'tint', { s: [1.7, .32, 1.5], p: [.15, 1.6, 0], w: .3 }], [ico1, 'tint', { s: [1, .26, .9], p: [.7, 1.3, .35], w: .3 }]]),
    bush: mk([[ico1, 'tint', { s: [.85, .6, .8], p: [0, .4, 0], w: .15 }], [ico1, 'tint', { s: [.55, .45, .5], p: [.55, .3, .2], w: .1 }]]),
    rock: mk([[dod, 'tint', { s: [1, .72, .88], p: [0, .38, 0] }], [dod, 'tint', { s: [.5, .4, .5], p: [.8, .18, .3], r: [0, .6, 0] }]]),
    food: mk([[ico1, 'tint', { s: [1, .88, 1], p: [0, .88, 0] }], [cyl3, '#6b4a2a', { s: [.07, .3, .07], p: [0, 1.85, 0] }], [ico0, '#3f9a4a', { s: [.32, .1, .18], p: [.28, 1.8, 0], r: [0, 0, .4] }]]),
    coin: mk([[new THREE.CylinderGeometry(1, 1, .3, 14), 'tint', { p: [0, .15, 0] }], [new THREE.CylinderGeometry(.62, .62, .08, 12), '#fff3b0', { p: [0, .32, 0] }]]),
    boat: mk([[box, 'tint', { s: [2, .5, .95], p: [0, .35, 0] }], [cone4, 'tint', { s: [.5, .9, .6], p: [1.3, .35, 0], r: [0, 0, -Math.PI / 2] }], [box, '#e8dcc0', { s: [1.7, .08, .7], p: [0, .62, 0] }], [cyl3, BROWN, { s: [.06, 1.6, .06], p: [-.1, 1.4, 0] }], [new THREE.ConeGeometry(.6, 1.3, 3), '#f6f1e4', { s: [1, 1, .1], p: [-.1, 1.5, 0], r: [0, 0, 0] }]]),
    fish: mk([[ico1, 'tint', { s: [1.1, .55, .5], p: [0, .55, 0] }], [cone4, 'tint', { s: [.45, .6, .08], p: [-1.2, .55, 0], r: [0, 0, Math.PI / 2] }], [ico0, '#ffffff', { s: .17, p: [.6, .72, .34] }], [ico0, '#141a21', { s: .09, p: [.65, .72, .4] }], [ico0, '#ffffff', { s: .17, p: [.6, .72, -.34] }], [ico0, '#141a21', { s: .09, p: [.65, .72, -.4] }]]),
    home: mk([[box, 'tint', { s: [1, .7, .85], p: [0, .35, 0] }], [cone4, '#b5503c', { s: [.98, .6, .86], p: [0, 1, 0], r: [0, 0, 0] }], [box, '#6b4a2a', { s: [.22, .38, .05], p: [0, .19, .44] }], [box, '#bfe3f0', { s: [.2, .2, .05], p: [-.3, .45, .44] }], [box, '#bfe3f0', { s: [.2, .2, .05], p: [.3, .45, .44] }]]),
    flower: mk([[cyl3, '#4e9a45', { s: [.03, .4, .03], p: [0, .2, 0] }], [ico0, 'tint', { s: [.16, .07, .16], p: [0, .42, 0] }], [ico0, '#ffd23f', { s: .06, p: [0, .46, 0] }]]),
    tuft: mk([[cone7, 'tint', { s: [.05, .45, .05], p: [0, .22, 0], r: [.2, 0, .15], w: .6 }], [cone7, 'tint', { s: [.05, .55, .05], p: [.05, .27, 0], r: [-.1, 0, -.2], w: .6 }], [cone7, 'tint', { s: [.05, .4, .05], p: [-.04, .2, .03], r: [.1, 0, .05], w: .6 }]]),
    leaf: mk([[disc(5), 'tint', { s: .13, p: [0, .015, 0] }]]),
    pumpkin: mk([[ico1, 'tint', { s: [.4, .3, .4], p: [0, .28, 0] }], [cyl3, '#4e7a34', { s: [.05, .14, .05], p: [0, .6, 0] }]]),
    mound: mk([[ico1, '#f4f9fc', { s: [1, .38, .9], p: [0, 0, 0] }]]),
    mush: mk([[cyl6, '#f3ead8', { s: [.07, .22, .07], p: [0, .11, 0] }], [ico1, 'tint', { s: [.2, .12, .2], p: [0, .24, 0] }]]),
    hedge: mk([[box, 'tint', { s: [2, .5, .5], p: [0, .25, 0] }], [ico1, 'tint', { s: [.4, .22, .3], p: [-.6, .5, 0], w: .1 }], [ico1, 'tint', { s: [.45, .25, .32], p: [.1, .52, 0], w: .1 }], [ico1, 'tint', { s: [.4, .22, .3], p: [.7, .5, 0], w: .1 }]]),
    reed: mk([[cyl3, '#8aa04a', { s: [.025, 1, .025], p: [0, .5, 0], r: [.1, 0, .08], w: 1.2 }], [cyl3, '#8aa04a', { s: [.025, 1.3, .025], p: [.06, .65, .03], r: [-.08, 0, -.1], w: 1.2 }], [cyl6, '#6b4a2a', { s: [.05, .22, .05], p: [.1, 1.3, .03], w: 1.2 }]]),
    pad: mk([[disc(10), 'tint', { s: .4, p: [0, .02, 0] }], [ico0, '#ff9ec4', { s: [.1, .06, .1], p: [.05, .06, 0] }]]),
    house: mk([[box, 'tint', { s: [1, .7, .85], p: [0, .35, 0] }], [cone4, '#b5503c', { s: [.98, .6, .86], p: [0, 1, 0] }], [box, '#6b4a2a', { s: [.22, .4, .05], p: [0, .2, .44] }], [box, '#bfe3f0', { s: [.2, .2, .05], p: [-.3, .45, .44] }], [box, '#bfe3f0', { s: [.2, .2, .05], p: [.3, .45, .44] }], [box, '#8a7d70', { s: [.14, .4, .14], p: [.3, 1.0, -.15] }]])
  };

  // ---- ground
  const TW = 34, TD = 28, GX = 136, GZ = 112;
  const tg = new THREE.PlaneGeometry(TW, TD, GX, GZ).rotateX(-Math.PI / 2);
  const tpos = tg.attributes.position, tN = tpos.count;
  tg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(tN * 3), 3));
  const land = new THREE.Mesh(tg, toon({ vertexColors: true })); scene.add(land);
  const radial = (stops) => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64); for (const [o, col] of stops) g.addColorStop(o, col); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); };
  const fade = radial([[0, '#fff'], [.5, '#fff'], [1, '#000']]);
  const sea = new THREE.Mesh(new THREE.CircleGeometry(48, 48).rotateX(-Math.PI / 2), toon({ transparent: true, alphaMap: fade }));
  patchWater(sea.material); sea.renderOrder = 1; scene.add(sea);
  const matCanvas = document.createElement('canvas'); matCanvas.width = 1020; matCanvas.height = 780;
  const matTex = new THREE.CanvasTexture(matCanvas); matTex.colorSpace = THREE.SRGBColorSpace; matTex.anisotropy = 4;
  const FY = .02; // play-mat height
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(8.5, 6.5).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: matTex, transparent: true }));
  mat.position.y = FY; mat.renderOrder = .5; scene.add(mat);
  const sceneryMat = toon({ vertexColors: true }); patchSway(sceneryMat);
  let scenery = null;
  const waterMat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uBase: { value: new THREE.Color('#8fd3f0') } }, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `varying vec2 vUv; uniform float uTime; uniform vec3 uBase;
void main(){ float s = sin(vUv.x * 12. + sin(vUv.y * 3.) * 2.); float st = smoothstep(.15, .9, sin(vUv.y * 16. - uTime * 3. + s * .7) * .5 + .5);
float edge = smoothstep(0., .18, vUv.x) * smoothstep(1., .82, vUv.x);
vec3 c = mix(uBase, vec3(1.), st * .55); c = mix(vec3(1.), c, edge); gl_FragColor = vec4(c, 1.);
#include <colorspace_fragment>
}`
  });
  let flow = null;
  // drifting particles (snow, leaves, petals): all motion is in the vertex shader
  const NP = 70, pg = new THREE.BufferGeometry(), seeds = new Float32Array(NP * 4);
  pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NP * 3), 3)); pg.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  const pmat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uPx: { value: 500 }, uSize: { value: .09 }, uFall: { value: .4 }, uCol: { value: new THREE.Color('#fff') } }, transparent: true, depthWrite: false,
    vertexShader: `attribute vec4 aSeed; uniform float uTime, uPx, uSize, uFall;
void main(){ vec3 p; p.x = (aSeed.x - .5) * 26. + sin(uTime * .4 + aSeed.w * 6.28) * .8; p.z = (aSeed.z - .5) * 20. + cos(uTime * .33 + aSeed.w * 6.28) * .6;
p.y = 6. - mod(aSeed.y * 7. + uTime * uFall * (.7 + aSeed.w * .6), 7.); vec4 mv = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = uSize * uPx / -mv.z; }`,
    fragmentShader: 'uniform vec3 uCol; void main(){ vec2 d = gl_PointCoord - .5; if (dot(d, d) > .25) discard; gl_FragColor = vec4(uCol, .85);\n#include <colorspace_fragment>\n}'
  });
  const parts = new THREE.Points(pg, pmat); parts.frustumCulled = false; parts.renderOrder = 6; scene.add(parts);

  // ---- biome build state
  let name = 'meadow', seedIn = 1, dark = false, BIOME = BIO.meadow, FIELD_Y = FY;
  let H = () => 0, rng = Math.random;
  const groundY = (X, Z) => (Math.abs(X) < 4.2 && Math.abs(Z) < 3.2) ? FIELD_Y : H(X, Z);

  const hx = 4.15, hz = 3.15, rr = .6;
  const dFn = (x, z) => { const qx = Math.abs(x) - (hx - rr), qz = Math.abs(z) - (hz - rr); return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - rr; };

  function build() {
    const hsl = {};
    const T = h => { const c = new THREE.Color(h); c.getHSL(hsl); c.setHSL(hsl.h, hsl.s * (dark ? .7 : .78), hsl.l * (dark ? .6 : 1.02)); return c; }; // muted, calm palette
    let hash = 7; for (const ch of name) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
    rng = mulberry((Math.imul(seedIn | 0, 2654435761) ^ hash) >>> 0);
    const nz = makeNoise(rng), nz2 = makeNoise(rng);
    const b = BIOME, lake = name === 'lake';
    const P = {}; for (const k of ['rim', 'rim2', 'mat', 'mat2', 'edge', 'sand', 'rock', 'path', 'water']) if (b[k]) P[k] = T(b[k]);
    const seaY = lake ? 0 : -.28;
    FIELD_Y = lake ? 0 : FY;
    const pick = arr => arr[Math.floor(rng() * arr.length)];
    const cols = arr => arr.map(T);

    // flatten zones (houses, pond) and the stream path
    const zones = [];
    let pathPts = null, zc = -5.7, wx = 0;
    if (name === 'foothills') {
      const s = rng() < .5 ? -1 : 1; wx = (rng() * 2 - 1) * 2.2; zc = -5.7 + (rng() - .5) * .3;
      const cp = [[wx, zc - 2.6], [wx + .3, zc - 1.4], [wx, zc + .1], [wx - .15 * s, zc + 1.3], [wx + s * 1.6, -4.5], [wx + s * 5, -4.6], [s * 8.5, -3.6], [s * 12, -2.4], [s * 14, -1.2]];
      pathPts = new THREE.CatmullRomCurve3(cp.map(p => new THREE.Vector3(p[0], 0, p[1]))).getPoints(170);
    }
    const pathD = (x, z) => { if (!pathPts) return 99; let m = 1e9; for (const p of pathPts) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < m) m = d; } return Math.sqrt(m); };
    const ieFn = (x, z) => Math.hypot(x / 13, (z + .4) / 10) * (1 + .16 * (nz(x * .12 + 9, z * .12 + 3, 2) - .5));
    const wFlat = (x, z) => { let w = 1; for (const q of zones) w = Math.min(w, smooth(q[2] * .7, q[2] * 1.4 + .5, Math.hypot(x - q[0], z - q[1]))); return w; };

    // village houses and winter pond are decided first so the terrain can flatten around them
    const houses = [];
    if (name === 'village') {
      const N = 10, a0 = rng() * 6.28;
      for (let k = 0; k < N; k++) { const a = a0 + (k + (rng() - .5) * .5) / N * 6.283, px = Math.cos(a) * (hx + 2.5 + rng() * .8), pz = Math.sin(a) * (hz + 2.5 + rng() * .8); if (pz > 3.4 && Math.abs(px) < 6) continue; houses.push([px, pz]); zones.push([px, pz, .9]); }
    }
    let pond = null;
    if (name === 'winter') { pond = [(rng() < .5 ? -1 : 1) * (6.2 + rng() * 1.5), -2 + rng() * 5, 1.5]; zones.push([pond[0], pond[1], 1.6]); }

    H = (x, z) => {
      const dF = dFn(x, z), ie = ieFn(x, z);
      let wN = smooth(.3, 2.8, dF) * wFlat(x, z), groove = 0;
      if (pathPts) { const d = pathD(x, z); wN *= smooth(.35, 1.6, d); groove = .12 * (1 - smooth(0, .7, d)); }
      let h = nz(x * b.f + 3, z * b.f + 5, 3) * 2 * b.amp * wN;
      if (name === 'hills') h += (nz2(x * .07, z * .07, 2) - .3) * 3 * smooth(.5, 3.5, dF) * wN;
      if (name === 'foothills') {
        h += 3.4 * smooth(zc + .55, zc - .55, z) * smooth(1, 2.5, dF) + Math.max(0, zc - .9 - z) * .55;
        h += (nz2(x * .5, z * .5, 2) - .5) * .6 * smooth(zc + .6, zc - .6, z) * smooth(.35, 1.6, pathD(x, z));
      }
      if (lake) { const dL = dF + (nz(x * .3 + 5, z * .3 + 7, 2) - .5) * 1.1; h = -.6 + smooth(0, 1.8, dL) * (1 + h * 1.3); }
      h -= smooth(.78, 1.04, ie) * 2.2 + (ie > 1.04 ? .6 : 0);
      return h - groove;
    };

    // terrain heights then colours
    const hs = new Float32Array(tN);
    for (let i = 0; i < tN; i++) { hs[i] = H(tpos.getX(i), tpos.getZ(i)); tpos.setY(i, hs[i]); }
    tg.computeVertexNormals(); tpos.needsUpdate = true; tg.computeBoundingSphere();
    const ca = tg.attributes.color, c = new THREE.Color(), cell = TW / GX, row = GX + 1, rock = P.rock;
    for (let i = 0; i < tN; i++) {
      const x = tpos.getX(i), z = tpos.getZ(i), h = hs[i], dF = dFn(x, z), ie = ieFn(x, z);
      const gx = (i % row), gz = (i / row) | 0;
      const sl = (Math.abs(hs[Math.min(tN - 1, i + 1)] - h) * (gx < GX ? 1 : 0) + Math.abs(hs[Math.min(tN - 1, i + row)] - h) * (gz < GZ ? 1 : 0)) / cell;
      c.copy(P.rim).lerp(P.rim2, smooth(.3, .7, nz2(x * .35, z * .35, 2)));
      if (name === 'foothills' || name === 'hills') c.lerp(P.rim2, smooth(1.2, 3.5, h) * .4);
      if (!lake) c.lerp(P.mat, 1 - smooth(0, 1.4, dF)); else c.lerp(P.sand, 1 - smooth(-.1, .22, h));
      if (name === 'village') {
        let path = 1 - smooth(.18, .3, Math.abs(dF - .8)) ;
        for (const q of houses) { const L = Math.hypot(q[0], q[1]), dx = -q[0] / L, dz = -q[1] / L, t = (x - q[0]) * dx + (z - q[1]) * dz, pd = Math.abs((x - q[0]) * dz - (z - q[1]) * dx); if (t > 0 && t < L) path = Math.max(path, 1 - smooth(.15, .28, pd)); }
        c.lerp(P.path, path * smooth(-.3, .2, dF));
      }
      if (name === 'foothills' && pathPts) c.lerp(P.rock, smooth(1.1, 1.8, sl) * smooth(-.5, 2.5, dF));
      else if (sl > .6 && dF > 1) c.lerp(rock, smooth(.6, 1.2, sl));
      if (!lake && ie > .8) c.lerp(P.sand, smooth(.8, .9, ie));
      if (ie > 1) c.lerp(P.sand, 1);
      c.offsetHSL(0, 0, (((i * 7919) % 13) / 13 - .5) * .025);
      ca.setXYZ(i, c.r, c.g, c.b);
    }
    ca.needsUpdate = true;

    // sea + play mat
    sea.position.y = seaY;
    sea.material.color.copy(lake ? T(b.water) : C('--sea'));
    mat.visible = !lake;
    if (!lake) paintMat(P);

    // scenery: baked into one mesh
    const sp = [], sc = [], ssw = [];
    const M = new THREE.Matrix4(), v = new THREE.Vector3(), Pq = new THREE.Vector3(), Sq = new THREE.Vector3(), Qy = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0), white = new THREE.Color('#fff');
    function put(tp, x, z, s, ry, color, yo = 0, sx = 1) {
      if (z > 3.4 && Math.abs(x) < 6.5 && tp !== TP.leaf && tp !== TP.flower && tp !== TP.tuft) s *= .6; // keep the near rim low so it never hides the field
      const y = H(x, z) + yo; M.compose(Pq.set(x, y, z), Qy.setFromAxisAngle(UP, ry), Sq.set(s * sx, s, s * sx));
      for (let i = 0; i < tp.n; i++) {
        v.set(tp.pos[3 * i], tp.pos[3 * i + 1], tp.pos[3 * i + 2]).applyMatrix4(M); sp.push(v.x, v.y, v.z);
        if (tp.tint[i]) sc.push(color.r, color.g, color.b); else sc.push(tp.col[3 * i], tp.col[3 * i + 1], tp.col[3 * i + 2]);
        ssw.push(tp.sway[i] * s);
      }
    }
    const occ = [];
    for (const q of zones) occ.push([q[0], q[1], q[2]]);
    function scatter(n, o, fn) {
      let k = 0;
      for (let t = 0; t < n * 40 && k < n; t++) {
        const x = (rng() * 2 - 1) * 13, z = (rng() * 2 - 1) * 10;
        if (dFn(x, z) < (o.minD ?? .5) || ieFn(x, z) > (o.maxIe ?? .8)) continue;
        if (o.tall && !(z < -.5 || Math.abs(x) > 5.4)) continue;
        if (pathD(x, z) < (o.path ?? 1.1)) continue;
        const h = H(x, z); if (h < (o.minH ?? -.05)) continue;
        if (o.maxH !== undefined && h > o.maxH) continue;
        const r = o.r ?? .4; if (occ.some(q => (q[0] - x) ** 2 + (q[1] - z) ** 2 < (q[2] + r) ** 2)) continue;
        if (!o.free) occ.push([x, z, r]);
        fn(x, z, k++);
      }
    }
    const R = (a, bb) => a + rng() * (bb - a), TAU = Math.PI * 2;
    const trees = cols(['#4c9e48', '#5eaf50', '#3d8e45']), fl = cols(['#ffd23f', '#ff7aa8', '#ffffff', '#a58bff', '#ff9a52']);
    const bushes = cols(['#58a64c', '#4a9a47', '#3f8c45']), rocks = cols(['#9ba59d', '#8a948d', '#a7aea6']);
    const rockC = (rock && rocks.map(r => r.clone().lerp(rock, .6)));
    const tree = (x, z, ty, s, cl) => put(ty, x, z, s, R(0, TAU), cl);
    const flowers = (n, pal) => scatter(n, { minD: .5, r: .12, free: true }, (x, z) => put(TP.flower, x, z, R(.4, .75), R(0, TAU), pick(pal)));
    const rocksN = (n, minS = .25, maxS = .6) => scatter(n, { minD: .6, r: .35 }, (x, z) => put(TP.rock, x, z, R(minS, maxS), R(0, TAU), pick(rockC), -.05));
    switch (name) {
      case 'meadow':
        scatter(14, { tall: true, r: .7 }, (x, z) => tree(x, z, TP.tree, R(.55, .85), pick(trees)));
        scatter(16, { r: .45 }, (x, z) => put(TP.bush, x, z, R(.4, .7), R(0, TAU), pick(bushes)));
        for (let k = 0; k < 16; k++) { const cx = (rng() * 2 - 1) * 12, cz = (rng() * 2 - 1) * 9, col = pick(fl); for (let j = 0; j < 8; j++) { const x = cx + R(-.7, .7), z = cz + R(-.7, .7); if (dFn(x, z) > .4 && ieFn(x, z) < .8 && H(x, z) > 0) put(TP.flower, x, z, R(.4, .7), R(0, TAU), col); } }
        rocksN(6);
        scatter(7, { r: .2 }, (x, z) => put(TP.mush, x, z, R(.6, 1), R(0, TAU), pick(cols(['#d9473c', '#e8a02a']))));
        break;
      case 'autumn': {
        const af = cols(['#e0701c', '#eaa02c', '#c0452b', '#d98a25', '#b8402a']);
        scatter(22, { tall: true, r: .7 }, (x, z) => tree(x, z, TP.tree, R(.55, .9), pick(af)));
        scatter(12, { r: .45 }, (x, z) => put(TP.bush, x, z, R(.4, .7), R(0, TAU), pick(af)));
        scatter(300, { minD: .35, r: .1, free: true }, (x, z) => put(TP.leaf, x, z, R(.7, 1.3), R(0, TAU), pick(af), .01));
        scatter(6, { r: .35 }, (x, z) => put(TP.pumpkin, x, z, R(.7, 1.2), R(0, TAU), T('#e8791f')));
        rocksN(5);
        break;
      }
      case 'savannah': {
        const ac = cols(['#7e9a3c', '#8da845', '#6f8c38']), tf = cols(['#cdb050', '#bfa045', '#d8bd62']);
        scatter(8, { tall: true, r: .9 }, (x, z) => tree(x, z, TP.acacia, R(.8, 1.2), pick(ac)));
        scatter(110, { minD: .4, r: .15, free: true }, (x, z) => put(TP.tuft, x, z, R(.7, 1.3), R(0, TAU), pick(tf)));
        rocksN(14, .25, .9);
        scatter(10, { r: .4 }, (x, z) => put(TP.bush, x, z, R(.3, .55), R(0, TAU), pick(cols(['#9aa34a', '#a8a950']))));
        break;
      }
      case 'hills': {
        const hg = cols(['#2f7d3e', '#3a8c46', '#348540']);
        scatter(10, { tall: true, r: .7 }, (x, z) => tree(x, z, TP.tree, R(.55, .85), pick(trees)));
        scatter(16, { r: .8, minD: .8 }, (x, z) => put(TP.hedge, x, z, R(.8, 1.4), R(0, TAU), pick(hg)));
        scatter(10, { r: .45 }, (x, z) => put(TP.bush, x, z, R(.4, .7), R(0, TAU), pick(bushes)));
        flowers(40, fl); rocksN(6);
        break;
      }
      case 'winter': {
        const pg2 = cols(['#2d6b5c', '#357a63', '#285d52']);
        scatter(28, { tall: true, r: .6 }, (x, z) => put(TP.snowPine, x, z, R(.55, .95), R(0, TAU), pick(pg2)));
        scatter(22, { r: .5, free: true, minD: .5 }, (x, z) => put(TP.mound, x, z, R(.4, 1), R(0, TAU), white, -.05));
        rocksN(8);
        // frozen pond: flat ice disc with a lighter centre
        const dsc = (x, z, r, col, yo) => { const a = disc(24).toNonIndexed().attributes.position; for (let i = 0; i < a.count; i++) { v.set(a.getX(i) * r * 1.2, 0, a.getZ(i) * r); sp.push(x + v.x, H(x, z) + yo, z + v.z); sc.push(col.r, col.g, col.b); ssw.push(0); } };
        dsc(pond[0], pond[1], 1.6, T('#9fcde0'), .03); dsc(pond[0] - .2, pond[1] - .1, 1.0, T('#bfe3f0'), .045);
        scatter(8, { r: .3, minD: .6 }, (x, z) => put(TP.rock, x, z, R(.15, .3), R(0, TAU), pick(rockC), -.03));
        break;
      }
      case 'foothills': {
        const pf = cols(['#2f7a4f', '#3b8a57', '#2a6e48']);
        scatter(26, { tall: true, r: .6, minD: 1 }, (x, z) => put(TP.pine, x, z, R(.55, .95), R(0, TAU), pick(pf)));
        scatter(22, { r: .4 }, (x, z) => put(TP.rock, x, z, R(.25, .8), R(0, TAU), pick(rockC), -.05));
        scatter(6, { tall: true, r: .7 }, (x, z) => tree(x, z, TP.tree, R(.55, .8), pick(trees)));
        scatter(8, { r: .45 }, (x, z) => put(TP.bush, x, z, R(.4, .65), R(0, TAU), pick(bushes)));
        flowers(24, cols(['#ffffff', '#a58bff', '#ffd23f']));
        break;
      }
      case 'lake': {
        scatter(12, { tall: true, r: .7, minH: .25 }, (x, z) => tree(x, z, TP.tree, R(.55, .85), pick(trees)));
        scatter(26, { r: .25, minH: -.02, maxH: .3, minD: .5, maxIe: .9, free: true }, (x, z) => put(TP.reed, x, z, R(.45, .8), R(0, TAU), white));
        scatter(26, { r: .4, minH: -2, maxH: -.2, minD: .15, maxIe: .9, free: true }, (x, z) => { if (H(x, z) < -.45 && dFn(x, z) < .3) return; put(TP.pad, x, z, R(.6, 1.1), R(0, TAU), T('#4f9a4a'), seaY - H(x, z) + .02); });
        scatter(10, { r: .45, minH: .25 }, (x, z) => put(TP.bush, x, z, R(.4, .7), R(0, TAU), pick(bushes)));
        scatter(6, { r: .3, minH: .1 }, (x, z) => put(TP.rock, x, z, R(.25, .5), R(0, TAU), pick(rockC), -.05));
        scatter(30, { r: .12, free: true, minH: .3 }, (x, z) => put(TP.flower, x, z, R(.4, .7), R(0, TAU), pick(fl)));
        break;
      }
      case 'village': {
        const wl = cols(['#f3e3c3', '#f0d6a0', '#e8c9c0', '#d9e6ea']);
        for (const q of houses) put(TP.house, q[0], q[1], R(1.1, 1.4), Math.atan2(-q[0], -q[1]), pick(wl), -.04);
        scatter(12, { tall: true, r: .7, minD: 1.2 }, (x, z) => tree(x, z, TP.tree, R(.55, .85), pick(trees)));
        scatter(14, { r: .45, minD: 1 }, (x, z) => put(TP.bush, x, z, R(.4, .7), R(0, TAU), pick(bushes)));
        scatter(30, { r: .12, free: true, minD: 1 }, (x, z) => put(TP.flower, x, z, R(.4, .7), R(0, TAU), pick(fl)));
        rocksN(4);
        break;
      }
    }
    if (scenery) { scene.remove(scenery); scenery.geometry.dispose(); }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(sp), 3)); sg.setAttribute('color', new THREE.BufferAttribute(Float32Array.from(sc), 3)); sg.setAttribute('sway', new THREE.BufferAttribute(Float32Array.from(ssw), 1));
    sg.computeVertexNormals(); sg.computeBoundingSphere();
    scenery = new THREE.Mesh(sg, sceneryMat); scenery.frustumCulled = false; scene.add(scenery);

    // waterfall + stream ribbon
    if (flow) { scene.remove(flow); flow.geometry.dispose(); flow = null; }
    if (pathPts) {
      const pos = [], uv = [], idx = [];
      let len = 0, prev = null, n = 0;
      for (let i = 0; i < pathPts.length; i++) {
        const p = pathPts[i], q = pathPts[Math.min(pathPts.length - 1, i + 1)], o = pathPts[Math.max(0, i - 1)];
        if (ieFn(p.x, p.z) > .88) break;
        let dx = q.x - o.x, dz = q.z - o.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        const w = (p.z > zc - .7 && p.z < zc + .8) ? .45 : .3;
        const lx = p.x - dz * w, lz = p.z + dx * w, rx = p.x + dz * w, rz = p.z - dx * w;
        const yl = Math.max(H(lx, lz), seaY) + .13, yr = Math.max(H(rx, rz), seaY) + .13;
        if (prev) len += Math.hypot(p.x - prev[0], (yl + yr) / 2 - prev[1], p.z - prev[2]);
        prev = [p.x, (yl + yr) / 2, p.z];
        pos.push(lx, yl, lz, rx, yr, rz); uv.push(0, len, 1, len);
        if (n > 0) idx.push(2 * n - 2, 2 * n - 1, 2 * n, 2 * n - 1, 2 * n + 1, 2 * n);
        n++;
      }
      const fg = new THREE.BufferGeometry();
      fg.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(pos), 3)); fg.setAttribute('uv', new THREE.BufferAttribute(Float32Array.from(uv), 2)); fg.setIndex(idx);
      waterMat.uniforms.uBase.value.copy(T('#7ccbe8'));
      flow = new THREE.Mesh(fg, waterMat); flow.frustumCulled = false; scene.add(flow);
    }

    // particles + light + ink
    parts.visible = !reduced && !!b.fall;
    if (b.fall) { for (let i = 0; i < NP * 4; i++) seeds[i] = rng(); pg.attributes.aSeed.needsUpdate = true; pmat.uniforms.uCol.value.copy(T(b.fall)); pmat.uniforms.uFall.value = name === 'winter' ? .35 : .22; pmat.uniforms.uSize.value = name === 'winter' ? .08 : .13; }
    hemi.color.set(dark ? '#9fb0e0' : '#fff4e0'); hemi.groundColor.set(dark ? '#1c2433' : '#6a7c8a'); hemi.intensity = dark ? 1.15 : 1.6;
    sun.color.set(dark ? '#c9d6ff' : '#fff5e6'); sun.intensity = dark ? 1.05 : 1.6; // moonlight in dark mode
    inkC.set(dark ? '#0b0f13' : '#43525c'); hullMat.color.copy(inkC);
    shadowMat.opacity = dark ? .45 : .26;
  }

  function paintMat(P) {
    const g = matCanvas.getContext('2d'), w = matCanvas.width, h = matCanvas.height, u = 120, m = 12, r = 66;
    g.clearRect(0, 0, w, h);
    g.save(); g.beginPath(); g.roundRect(m, m, w - 2 * m, h - 2 * m, r); g.clip();
    g.fillStyle = P.mat.getStyle(); g.fillRect(0, 0, w, h);
    if (name === 'village') { // cobbles
      for (let y = 0, j = 0; y < h; y += 26, j++) for (let x = (j % 2) * 20; x < w; x += 40) { g.fillStyle = (rng() < .5 ? P.mat : P.mat2).getStyle(); g.fillRect(x + 1, y + 1, 38, 24); }
    } else {
      g.fillStyle = P.mat2.getStyle(); for (let x = 0; x < w; x += u) g.fillRect(x, 0, u / 2, h);
      g.fillStyle = P.edge.getStyle(); g.globalAlpha = .22;
      for (let i = 0; i < 260; i++) { const x = rng() * w, y = rng() * h; g.beginPath(); g.ellipse(x, y, 2 + rng() * 3, 1 + rng() * 1.5, 0, 0, 7); g.fill(); }
      g.globalAlpha = 1;
    }
    g.restore();
    g.lineWidth = 8; g.strokeStyle = P.edge.getStyle(); g.beginPath(); g.roundRect(m + 3, m + 3, w - 2 * m - 6, h - 2 * m - 6, r - 3); g.stroke();
    matTex.needsUpdate = true;
  }

  // ---- instanced pools
  const dummy = new THREE.Object3D(), tmpC = new THREE.Color();
  function pool(geo, mt, max, color = true) {
    const m = new THREE.InstancedMesh(geo, mt, max);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (color) m.setColorAt(0, tmpC.set('#fff'));
    m.count = 0; m.frustumCulled = false; m.visible = false; scene.add(m);
    return m;
  }
  const hullMat = new THREE.MeshBasicMaterial({ color: 0x1b2733, side: THREE.BackSide }); patchHull(hullMat);
  const propMat = toon({ vertexColors: true }); patchTint(propMat);
  const basic = c => new THREE.MeshBasicMaterial({ color: c });
  const sphere = new THREE.SphereGeometry(1, 16, 12);
  const body = pool(sphere, toon(), MAX.blob);
  const hull = pool(sphere, hullMat, MAX.blob, false); hull.instanceMatrix = body.instanceMatrix;
  const eyeW = pool(new THREE.SphereGeometry(1, 10, 8), basic(0xffffff), MAX.blob * 2, false);
  const eyeP = pool(new THREE.SphereGeometry(1, 8, 6), basic(0x141a21), MAX.blob * 2, false);
  const brow = pool(new THREE.BoxGeometry(1, .24, .3), basic(0x141a21), MAX.blob * 2, false);
  const mouth = pool(new THREE.TorusGeometry(1, .34, 5, 14, Math.PI), basic(0x141a21), MAX.blob, false);
  const shadowMat = new THREE.MeshBasicMaterial({ map: radial([[0, 'rgba(0,0,0,1)'], [.55, 'rgba(0,0,0,.6)'], [1, 'rgba(0,0,0,0)']]), color: 0x1a2a33, transparent: true, opacity: .26, depthWrite: false });
  const shadow = pool(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), shadowMat, MAX.blob, false); shadow.renderOrder = 2;
  const props = {}, propHull = {};
  for (const k of ['tree', 'pine', 'bush', 'rock', 'food', 'coin', 'boat', 'fish', 'home']) {
    const g = geoOf(TP[k]);
    props[k] = pool(g, propMat, MAX[k]);
    const hg = mergeVertices(new THREE.BufferGeometry().setAttribute('position', g.attributes.position)); hg.computeVertexNormals();
    propHull[k] = pool(hg, hullMat, MAX[k], false); propHull[k].instanceMatrix = props[k].instanceMatrix;
  }
  const rings = pool(new THREE.TorusGeometry(1, .05, 6, 28).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .6 }), MAX.ring); rings.renderOrder = 4;

  const LMAX = 3000, lineGeo = new THREE.BufferGeometry();
  const lpos = new Float32Array(LMAX * 6), lcol = new Float32Array(LMAX * 8);
  lineGeo.setAttribute('position', new THREE.BufferAttribute(lpos, 3).setUsage(THREE.DynamicDrawUsage));
  lineGeo.setAttribute('color', new THREE.BufferAttribute(lcol, 4).setUsage(THREE.DynamicDrawUsage));
  const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true }));
  lines.frustumCulled = false; lines.renderOrder = 5; scene.add(lines);

  let fieldMesh = null, fieldTex = null;
  function field(cols, rows, rgba) {
    if (!fieldTex || fieldTex.image.width !== cols || fieldTex.image.height !== rows) {
      if (fieldMesh) { scene.remove(fieldMesh); fieldTex.dispose(); fieldMesh.geometry.dispose(); fieldMesh.material.dispose(); }
      fieldTex = new THREE.DataTexture(new Uint8Array(cols * rows * 4), cols, rows, THREE.RGBAFormat);
      fieldTex.magFilter = THREE.NearestFilter; fieldTex.colorSpace = THREE.SRGBColorSpace;
      fieldMesh = new THREE.Mesh(new THREE.PlaneGeometry(BS.W * K, K).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: fieldTex, transparent: true }));
      fieldMesh.renderOrder = 3; fieldTex.flipY = false; scene.add(fieldMesh);
    }
    fieldMesh.position.y = FIELD_Y + .015;
    fieldTex.image.data.set(rgba); fieldTex.needsUpdate = true; fieldMesh.visible = true;
  }

  // ---- labels (HTML bubbles, pooled)
  const labelEls = [];
  let nLabel = 0, W = 1, H2 = 1;
  const v3 = new THREE.Vector3();
  function label(x, y, text, color = '--ink', a = 1, lift = .1) {
    if (a <= 0) return;
    let el = labelEls[nLabel];
    if (!el) { el = document.createElement('span'); el.className = 'bubble'; labelLayer.appendChild(el); labelEls.push(el); }
    nLabel++;
    v3.set(toX(x), groundY(toX(x), toZ(y)) + lift * K, toZ(y)).project(camera);
    el.hidden = v3.z > 1;
    el.style.transform = `translate(${(v3.x * .5 + .5) * W}px, ${(-v3.y * .5 + .5) * H2}px) translate(-50%, -100%)`;
    el.style.opacity = Math.min(1, a);
    el.style.setProperty('--c', `var(${color})`);
    if (el.textContent !== text) el.textContent = text;
  }

  // ---- per-frame API
  let nb = 0, ne = 0, nbr = 0, nm = 0, nr = 0, nl = 0, ns = 0;
  const counts = {};
  const fv = new THREE.Vector3(), sv = new THREE.Vector3(), uv = new THREE.Vector3(), UPV = new THREE.Vector3(0, 1, 0);
  const basis = new THREE.Matrix4(), faceQ = new THREE.Quaternion(), tq = new THREE.Quaternion(), zq = new THREE.Quaternion(), ZAX = new THREE.Vector3(0, 0, 1), Q0 = new THREE.Quaternion();
  const mP = new THREE.Vector3(), mS = new THREE.Vector3(), M4 = new THREE.Matrix4();
  function begin() {
    nb = ne = nbr = nm = nr = nl = ns = 0; nLabel = 0;
    for (const k in props) counts[k] = 0;
    if (fieldMesh) fieldMesh.visible = false;
    fv.copy(camera.position).sub(controls.target).normalize();
    sv.crossVectors(UPV, fv).normalize(); uv.crossVectors(fv, sv);
    basis.makeBasis(sv, uv, fv); faceQ.setFromRotationMatrix(basis);
  }
  // place a face feature on the blob surface: a right, b up (blob radii), c depth along the view
  function feat(m, i, X, Y, Z, R, a, b, c, ax, ay, az, q) {
    mP.set(X + (sv.x * a + uv.x * b + fv.x * c) * R, Y + (sv.y * a + uv.y * b + fv.y * c) * R, Z + (sv.z * a + uv.z * b + fv.z * c) * R);
    M4.compose(mP, q, mS.set(ax, ay, az)); m.setMatrixAt(i, M4);
  }
  const NONE = {};
  function blob(x, y, r, color, o = NONE) {
    if (nb >= MAX.blob) return;
    const X = toX(x), Z = toZ(y), R = r * K, G = groundY(X, Z), sq = o.squash || 1, sx = R / Math.sqrt(sq), sy = R * .9 * sq, lift = (o.lift || 0) * K;
    const Y = G + lift + sy;
    M4.compose(mP.set(X, Y, Z), Q0, mS.set(sx, sy, sx)); body.setMatrixAt(nb, M4); body.setColorAt(nb, C(color));
    nb++;
    if (o.shadow !== false) { const sr = R * 1.25 * Math.max(.5, 1 - lift * 1.5); M4.compose(mP.set(X + R * .15, G + .03, Z - R * .1), Q0, mS.set(sr, 1, sr)); shadow.setMatrixAt(ns++, M4); }
    if (R < .05) return;
    const blink = o.blink ? .12 : 1, ang = o.angry ? .5 : o.frown ? -.35 : 0, look = (o.look || 0) * .06;
    for (let side = -1; side < 2; side += 2) {
      const a = side * .34, b = .12, c = Math.sqrt(1 - a * a - b * b) * .96;
      feat(eyeW, ne, X, Y, Z, R, a, b, c, R * .2, R * .26 * blink * (o.angry ? .8 : 1), R * .1, faceQ);
      feat(eyeP, ne, X, Y, Z, R, a + look + side * -.02, b - .01, c + .06, R * .1, R * .14 * blink, R * .06, faceQ);
      ne++;
      if (ang) { zq.setFromAxisAngle(ZAX, side * ang); tq.copy(faceQ).multiply(zq); feat(brow, nbr++, X, Y, Z, R, side * .33, .5 - (o.angry ? .04 : 0), Math.sqrt(1 - .33 * .33 - .5 * .5) * .96, R * .17, R * .17, R * .1, tq); }
    }
    if (o.smile || o.frown || o.angry) {
      const sm = o.smile && !o.frown; zq.setFromAxisAngle(ZAX, sm ? Math.PI : 0); tq.copy(faceQ).multiply(zq);
      feat(mouth, nm++, X, Y, Z, R, 0, sm ? -.12 - .1 : -.5, .93, R * .2, R * .2, R * .08, tq);
    }
  }
  const lakeWater = () => name === 'lake';
  function prop(kind, x, y, s, color, o = NONE) {
    const m = props[kind]; if (!m || counts[kind] >= MAX[kind]) return;
    const X = toX(x), Z = toZ(y), S = s * K, i = counts[kind]++;
    let Y = groundY(X, Z) + (o.lift || 0) * K;
    if (lakeWater() && (kind === 'boat' || kind === 'fish')) Y += Math.sin(U.uTime.value * 1.4 + X * 2) * .015;
    M4.compose(mP.set(X, Y, Z), tq.setFromAxisAngle(UPV, o.rot || 0), mS.set(S, S, S));
    m.setMatrixAt(i, M4); m.setColorAt(i, C(color));
  }
  function line(x1, y1, x2, y2, color, a = 1, lift = .02) {
    if (nl >= LMAX) return;
    const c = C(color), i = nl * 6, j = nl * 8, X1 = toX(x1), Z1 = toZ(y1), X2 = toX(x2), Z2 = toZ(y2);
    lpos[i] = X1; lpos[i + 1] = groundY(X1, Z1) + lift * K + .03; lpos[i + 2] = Z1; lpos[i + 3] = X2; lpos[i + 4] = groundY(X2, Z2) + lift * K + .03; lpos[i + 5] = Z2;
    lcol[j] = lcol[j + 4] = c.r; lcol[j + 1] = lcol[j + 5] = c.g; lcol[j + 2] = lcol[j + 6] = c.b; lcol[j + 3] = lcol[j + 7] = Math.min(1, a);
    nl++;
  }
  function ring(x, y, r, color) {
    if (nr >= MAX.ring) return;
    const X = toX(x), Z = toZ(y), R = r * K;
    M4.compose(mP.set(X, groundY(X, Z) + .05, Z), Q0, mS.set(R, R, R)); rings.setMatrixAt(nr, M4); rings.setColorAt(nr, C(color)); nr++;
  }
  function flush(m, n, h) { m.count = n; m.visible = n > 0; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; if (h) { h.count = n; h.visible = n > 0; } }
  function end() {
    flush(body, nb, hull); flush(eyeW, ne); flush(eyeP, ne); flush(brow, nbr); flush(mouth, nm); flush(shadow, ns); flush(rings, nr);
    for (const k in props) flush(props[k], counts[k]); // props stay outline-free: only blobs carry a soft edge
    lineGeo.setDrawRange(0, nl * 2); lineGeo.attributes.position.needsUpdate = true; lineGeo.attributes.color.needsUpdate = true;
    for (let i = nLabel; i < labelEls.length; i++) labelEls[i].hidden = true;
    U.uTime.value = reduced ? 0 : performance.now() / 1000;
    controls.update();
    renderer.render(scene, camera);
  }

  // ---- camera framing: fit the 8 x 6 play field; width-limited on wide screens, height-limited on tall ones
  const POLAR = .9;
  // HUD insets (px) that the play field must stay clear of: [left, right, top, bottom]
  const insets = () => W <= 900 ? [8, 8, Math.min(340, H2 * .39), Math.min(300, H2 * .34)] : [16, W >= 1100 ? 360 : W * .3, 80, 280]; // phone: tabs + plot strip on top, story + dock below
  const fitDist = () => { const [l, r, t, b] = insets(), cw = Math.max(60, W - l - r), ch = Math.max(60, H2 - t - b); return 1.04 * Math.max(2.45 / TAN, 4.75 / (TAN * cw / ch)) * H2 / ch; };
  function frame() {
    const d = fitDist();
    controls.minDistance = d * .4; controls.maxDistance = d * 1.5;
    if (!touched) camera.position.set(controls.target.x, controls.target.y + d * Math.cos(POLAR), controls.target.z + d * Math.sin(POLAR));
  }
  function resize() {
    const r = canvas.getBoundingClientRect(); W = r.width; H2 = r.height;
    renderer.setSize(W, H2, false); camera.aspect = W / Math.max(1, H2); camera.updateProjectionMatrix();
    const [il, ir, it, ib] = insets(); // shift the view so the field centres in the clear area
    camera.setViewOffset(W, H2, -((il + W - ir) / 2 - W / 2), -((it + H2 - ib) / 2 - H2 / 2), W, H2);
    pmat.uniforms.uPx.value = H2 * renderer.getPixelRatio() / (2 * TAN);
    frame();
  }
  function theme() {
    cc.clear(); dark = new THREE.Color(BS.col('--paper') || '#fff').getHSL({}).l < .5;
    build();
  }
  new ResizeObserver(resize).observe(canvas);
  function setBiome(n, seed) {
    name = BIO[n] ? n : 'meadow'; BIOME = BIO[name]; seedIn = seed | 0; touched = false;
    cc.clear(); dark = new THREE.Color(BS.col('--paper') || '#fff').getHSL({}).l < .5;
    build(); frame();
  }
  resize(); setBiome('meadow', 1);
  return { begin, blob, prop, line, label, ring, field, end, setBiome, theme, resize, camera, controls, scene, renderer, K };
}
