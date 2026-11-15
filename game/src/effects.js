// effects.js — tracers, muzzle flash and impact sparks, all pooled.
// No allocations in the hot loop: a fixed pool of line objects is reused,
// and a single THREE.Points cloud holds the spark particles.

import * as THREE from 'three';

const TRACER_MAX = 24;
const SPARK_MAX = 240;

export function createEffects(scene) {
  const tracers = [];
  for (let i = 0; i < TRACER_MAX; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0 });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerIdx = 0;

  // spark cloud
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(SPARK_MAX * 3);
  const sparkCol = new Float32Array(SPARK_MAX * 3);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  sparkGeo.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3));
  const sparkMat = new THREE.PointsMaterial({ size: 0.09, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.frustumCulled = false;
  scene.add(sparks);
  const sparkVel = new Float32Array(SPARK_MAX * 3);
  const sparkLife = new Float32Array(SPARK_MAX);
  let sparkIdx = 0;

  // muzzle flash: one light + one sprite, reused for every shot
  const flashLight = new THREE.PointLight(0xffc46a, 0, 9, 2);
  scene.add(flashLight);
  const flashCanvas = document.createElement('canvas');
  flashCanvas.width = 64; flashCanvas.height = 64;
  const fg = flashCanvas.getContext('2d');
  const grad = fg.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,240,180,1)'); grad.addColorStop(0.4, 'rgba(255,160,60,0.8)'); grad.addColorStop(1, 'rgba(255,120,20,0)');
  fg.fillStyle = grad; fg.fillRect(0, 0, 64, 64);
  const flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(flashCanvas), transparent: true, opacity: 0, depthWrite: false }));
  flashSprite.scale.set(0.9, 0.9, 1);
  scene.add(flashSprite);
  let flashLife = 0;

  return {
    tracer(from, to, color) {
      const t = tracers[tracerIdx];
      tracerIdx = (tracerIdx + 1) % TRACER_MAX;
      const p = t.line.geometry.attributes.position.array;
      p[0] = from.x; p[1] = from.y; p[2] = from.z;
      p[3] = to.x; p[4] = to.y; p[5] = to.z;
      t.line.geometry.attributes.position.needsUpdate = true;
      t.line.material.color.setHex(color || 0xffd27a);
      t.line.material.opacity = 0.9;
      t.life = 0.09;
    },
    muzzle(pos) {
      flashLight.position.set(pos.x, pos.y, pos.z);
      flashLight.intensity = 26;
      flashSprite.position.copy(flashLight.position);
      flashSprite.material.opacity = 0.95;
      flashLife = 0.06;
    },
    burst(point, color, count, speed) {
      const c = new THREE.Color(color);
      for (let n = 0; n < count; n++) {
        const i = sparkIdx;
        sparkIdx = (sparkIdx + 1) % SPARK_MAX;
        sparkPos[i * 3] = point.x; sparkPos[i * 3 + 1] = point.y; sparkPos[i * 3 + 2] = point.z;
        const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
        const v = speed * (0.4 + Math.random() * 0.8);
        sparkVel[i * 3] = Math.sin(ph) * Math.cos(th) * v;
        sparkVel[i * 3 + 1] = Math.cos(ph) * v;
        sparkVel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * v;
        sparkCol[i * 3] = c.r; sparkCol[i * 3 + 1] = c.g; sparkCol[i * 3 + 2] = c.b;
        sparkLife[i] = 0.35 + Math.random() * 0.3;
      }
      sparkGeo.attributes.color.needsUpdate = true;
    },
    update(dt) {
      for (const t of tracers) {
        if (t.life > 0) {
          t.life -= dt;
          t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
        }
      }
      if (flashLife > 0) {
        flashLife -= dt;
        const k = Math.max(0, flashLife / 0.06);
        flashLight.intensity = 26 * k;
        flashSprite.material.opacity = 0.95 * k;
      } else {
        flashLight.intensity = 0;
        flashSprite.material.opacity = 0;
      }
      let any = false;
      for (let i = 0; i < SPARK_MAX; i++) {
        if (sparkLife[i] <= 0) continue;
        any = true;
        sparkLife[i] -= dt;
        sparkPos[i * 3] += sparkVel[i * 3] * dt;
        sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1] * dt;
        sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
        sparkVel[i * 3 + 1] -= 6 * dt;
        if (sparkLife[i] <= 0) { sparkPos[i * 3 + 1] = -100; }
      }
      if (any) sparkGeo.attributes.position.needsUpdate = true;
    },
  };
}
