<template>
  <canvas ref="canvasRef" class="auth-particle-canvas" aria-hidden="true"></canvas>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

type Particle = {
  x: number;
  y: number;
  originX: number;
  originY: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  phase: number;
  drift: number;
};

type PulseRing = {
  x: number;
  y: number;
  age: number;
  life: number;
  strength: number;
};

type MediaListenerTarget = MediaQueryList & {
  addListener?: (listener: (event: MediaQueryListEvent) => void) => void;
  removeListener?: (listener: (event: MediaQueryListEvent) => void) => void;
};

const props = withDefaults(defineProps<{ variant?: 'user' | 'admin' }>(), {
  variant: 'user'
});

const canvasRef = ref<HTMLCanvasElement | null>(null);
const particles: Particle[] = [];
const pulseRings: PulseRing[] = [];

let ctx: CanvasRenderingContext2D | null = null;
let rafId = 0;
let width = 0;
let height = 0;
let dpr = 1;
let mobileQuery: MediaQueryList | null = null;
let reduceMotionQuery: MediaQueryList | null = null;
let isMobile = false;
let reduceMotion = false;
let inputPulse = 0;
let lastFrame = 0;
let lastTypingAt = 0;
let activeInputCenter = { x: 0, y: 0, valid: false };

const pointer = {
  x: 0,
  y: 0,
  targetX: 0,
  targetY: 0,
  active: false
};

const palette = {
  particle: props.variant === 'admin' ? '37, 99, 235' : '22, 137, 255',
  accent: props.variant === 'admin' ? '14, 165, 233' : '24, 184, 137',
  warm: props.variant === 'admin' ? '99, 102, 241' : '255, 173, 33'
};

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function syncMedia() {
  isMobile = Boolean(mobileQuery?.matches) || window.innerWidth <= 720;
  reduceMotion = Boolean(reduceMotionQuery?.matches);
}

function resizeCanvas() {
  const canvas = canvasRef.value;
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  width = Math.max(1, Math.round(rect.width));
  height = Math.max(1, Math.round(rect.height));
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx = canvas.getContext('2d');
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);

  activeInputCenter = { x: width * 0.5, y: height * 0.34, valid: false };
  buildParticles();
}

function buildParticles() {
  particles.length = 0;
  if (!width || !height) return;

  const area = width * height;
  const baseCount = isMobile ? area / 8800 : area / 9800;
  const count = Math.max(isMobile ? 72 : 76, Math.min(isMobile ? 132 : 140, Math.round(baseCount)));

  for (let i = 0; i < count; i += 1) {
    const x = rand(0, width);
    const y = rand(0, height);
    particles.push({
      x,
      y,
      originX: x,
      originY: y,
      vx: 0,
      vy: 0,
      radius: rand(isMobile ? 1.65 : 1.25, isMobile ? 3.95 : 3.2),
      alpha: rand(isMobile ? 0.42 : 0.32, isMobile ? 0.9 : 0.82),
      phase: rand(0, Math.PI * 2),
      drift: rand(0.35, 1.15)
    });
  }
}

function toCanvasPoint(clientX: number, clientY: number) {
  const canvas = canvasRef.value;
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  return {
    x: clientX - rect.left,
    y: clientY - rect.top
  };
}

function getElementCenter(target: EventTarget | null) {
  const canvas = canvasRef.value;
  if (!canvas) return null;

  let element: Element | null = null;
  if (target instanceof Element) {
    element = target.closest('input, textarea, .van-field, .el-input, .el-input__wrapper');
  }
  if (!element && document.activeElement instanceof Element) {
    element = document.activeElement.closest('input, textarea, .van-field, .el-input, .el-input__wrapper');
  }
  if (!element) return null;

  const elementRect = element.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();
  return {
    x: Math.min(width - 18, Math.max(18, elementRect.left + elementRect.width / 2 - canvasRect.left)),
    y: Math.min(height - 18, Math.max(18, elementRect.top + elementRect.height / 2 - canvasRect.top))
  };
}

function updatePointer(event: PointerEvent) {
  if (isMobile) return;
  const point = toCanvasPoint(event.clientX, event.clientY);
  if (!point) return;
  pointer.targetX = point.x;
  pointer.targetY = point.y;
  pointer.active = pointer.targetX >= 0 && pointer.targetX <= width && pointer.targetY >= 0 && pointer.targetY <= height;
}

function resetPointer() {
  pointer.active = false;
}

function kickParticles(x: number, y: number, strength: number) {
  const range = isMobile ? 340 : 250;
  for (const particle of particles) {
    const dx = particle.x - x;
    const dy = particle.y - y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    if (distance > range) continue;

    const force = (1 - distance / range) ** 2 * strength;
    const side = Math.sin(particle.phase) > 0 ? 1 : -1;
    particle.vx += (dx / distance) * force * 2.7 + (-dy / distance) * force * side * 1.35;
    particle.vy += (dy / distance) * force * 2.7 + Math.sin(particle.phase) * force * 1.9;
  }
}

function boostFromTyping(event: Event, strength = 1) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof Element)) return;

  const center = getElementCenter(target);
  if (center) {
    activeInputCenter = { ...center, valid: true };
    pulseRings.push({ x: center.x, y: center.y, age: 0, life: reduceMotion ? 0.48 : 0.78, strength });
    if (pulseRings.length > 8) pulseRings.splice(0, pulseRings.length - 8);
    kickParticles(center.x, center.y, isMobile ? 1.8 * strength : 0.75 * strength);
  }

  const valueLength = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ? target.value.length : 8;
  inputPulse = Math.min(isMobile ? 3.2 : 1.35, inputPulse + (isMobile ? 0.95 : 0.42) * strength + Math.min(valueLength, 22) * 0.026);
  lastTypingAt = performance.now();
}

function boostFromFocus(event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof Element)) return;
  const center = getElementCenter(target);
  if (center) activeInputCenter = { ...center, valid: true };
  inputPulse = Math.min(isMobile ? 1.8 : 0.95, inputPulse + (isMobile ? 0.72 : 0.32));
}

function boostFromKeydown(event: KeyboardEvent) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof Element)) return;
  if (['Shift', 'Control', 'Alt', 'Meta', 'Tab', 'CapsLock'].includes(event.key)) return;
  boostFromTyping(event, event.key === 'Backspace' ? 0.78 : 0.92);
}

function drawConnections(context: CanvasRenderingContext2D) {
  const maxDistance = isMobile ? 106 : 118;
  const maxDistanceSq = maxDistance * maxDistance;
  context.lineWidth = 1;

  for (let i = 0; i < particles.length; i += 1) {
    const a = particles[i];
    for (let j = i + 1; j < particles.length; j += 1) {
      const b = particles[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq > maxDistanceSq) continue;

      const opacity = (1 - distanceSq / maxDistanceSq) * (isMobile ? 0.17 + inputPulse * 0.1 : 0.16);
      context.strokeStyle = `rgba(${palette.particle}, ${opacity})`;
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.stroke();
    }
  }
}

function drawPointerGlow(context: CanvasRenderingContext2D) {
  if (!pointer.active || isMobile) return;

  const gradient = context.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, 260);
  gradient.addColorStop(0, `rgba(${palette.particle}, 0.18)`);
  gradient.addColorStop(0.55, `rgba(${palette.accent}, 0.07)`);
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(pointer.x, pointer.y, 260, 0, Math.PI * 2);
  context.fill();
}

function drawMobileTypingGlow(context: CanvasRenderingContext2D, delta: number) {
  if (!isMobile) return;

  const anchorX = activeInputCenter.valid ? activeInputCenter.x : width * 0.5;
  const anchorY = activeInputCenter.valid ? activeInputCenter.y : height * 0.34;
  const glowPower = Math.min(1, inputPulse / 2.2);

  if (glowPower > 0.02) {
    const radius = 138 + glowPower * 78;
    const gradient = context.createRadialGradient(anchorX, anchorY, 0, anchorX, anchorY, radius);
    gradient.addColorStop(0, `rgba(${palette.particle}, ${0.19 * glowPower})`);
    gradient.addColorStop(0.52, `rgba(${palette.accent}, ${0.08 * glowPower})`);
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(anchorX, anchorY, radius, 0, Math.PI * 2);
    context.fill();
  }

  for (let i = pulseRings.length - 1; i >= 0; i -= 1) {
    const ring = pulseRings[i];
    ring.age += delta / 1000;
    const progress = ring.age / ring.life;
    if (progress >= 1) {
      pulseRings.splice(i, 1);
      continue;
    }

    const eased = 1 - (1 - progress) ** 2;
    const radius = 18 + eased * 230;
    const opacity = (1 - progress) * 0.34 * ring.strength;
    context.lineWidth = 1.2 + (1 - progress) * 1.6;
    context.strokeStyle = `rgba(${palette.particle}, ${opacity})`;
    context.beginPath();
    context.arc(ring.x, ring.y, radius, 0, Math.PI * 2);
    context.stroke();

    context.strokeStyle = `rgba(${palette.warm}, ${opacity * 0.46})`;
    context.beginPath();
    context.arc(ring.x, ring.y, radius * 0.58, 0, Math.PI * 2);
    context.stroke();
  }
}

function tick(time: number) {
  const context = ctx;
  if (!context) return;

  const delta = lastFrame ? Math.min(40, time - lastFrame) : 16;
  lastFrame = time;
  const t = time * 0.001;

  context.clearRect(0, 0, width, height);
  pointer.x += (pointer.targetX - pointer.x) * 0.14;
  pointer.y += (pointer.targetY - pointer.y) * 0.14;

  drawPointerGlow(context);
  drawMobileTypingGlow(context, delta);
  drawConnections(context);

  const anchorX = activeInputCenter.valid ? activeInputCenter.x : width * 0.5;
  const anchorY = activeInputCenter.valid ? activeInputCenter.y : height * 0.34;
  const rhythmicHold = isMobile && performance.now() - lastTypingAt < 220 ? 0.55 : 0;
  const motionPulse = Math.max(inputPulse, rhythmicHold);
  const reduceFactor = reduceMotion ? 0.45 : 1;

  for (const particle of particles) {
    const floatX = Math.sin(t * particle.drift + particle.phase) * (isMobile ? 7 : 9) * reduceFactor;
    const floatY = Math.cos(t * particle.drift * 0.82 + particle.phase) * (isMobile ? 8 : 11) * reduceFactor;
    let targetX = particle.originX + floatX;
    let targetY = particle.originY + floatY;

    if (isMobile) {
      const dx = particle.x - anchorX;
      const dy = particle.y - anchorY;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const range = 360;
      const force = Math.max(0, 1 - distance / range) * Math.min(1.7, motionPulse) * reduceFactor;
      const wave = Math.sin(distance * 0.054 - t * 16.5 + particle.phase);
      targetX += (dx / distance) * force * 54 + Math.cos(t * 7.8 + particle.phase) * force * 18;
      targetY += wave * force * 46 + (dy / distance) * force * 22;
    } else if (pointer.active) {
      const dx = particle.x - pointer.x;
      const dy = particle.y - pointer.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const range = 230;
      if (distance < range) {
        const force = (1 - distance / range) ** 2;
        const direction = particle.phase % 2 > 1 ? 1 : -1;
        targetX += (dx / distance) * force * 42 + (-dy / distance) * force * 18 * direction;
        targetY += (dy / distance) * force * 42 + (dx / distance) * force * 18 * direction;
      }
    }

    particle.vx += (targetX - particle.x) * (isMobile ? 0.045 : 0.018) * (delta / 16);
    particle.vy += (targetY - particle.y) * (isMobile ? 0.045 : 0.018) * (delta / 16);
    particle.vx *= isMobile ? 0.82 : 0.90;
    particle.vy *= isMobile ? 0.82 : 0.90;
    particle.x += particle.vx;
    particle.y += particle.vy;

    const radius = particle.radius * (1 + (isMobile ? Math.min(1, motionPulse / 2.2) * 0.68 : 0));
    const opacity = Math.min(0.98, particle.alpha + (isMobile ? Math.min(1, motionPulse / 2.3) * 0.24 : 0));
    context.fillStyle = `rgba(${palette.particle}, ${opacity})`;
    context.beginPath();
    context.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = `rgba(255, 255, 255, ${0.42 + opacity * 0.24})`;
    context.beginPath();
    context.arc(particle.x - radius * 0.3, particle.y - radius * 0.3, Math.max(0.65, radius * 0.34), 0, Math.PI * 2);
    context.fill();
  }

  const decay = Math.pow(isMobile ? 0.905 : 0.94, delta / 16);
  inputPulse *= decay;
  if (inputPulse < 0.01) inputPulse = 0;

  rafId = window.requestAnimationFrame(tick);
}

function start() {
  window.cancelAnimationFrame(rafId);
  lastFrame = 0;
  rafId = window.requestAnimationFrame(tick);
}

function handleMediaChange() {
  syncMedia();
  resizeCanvas();
  start();
}

function addMediaListener(query: MediaQueryList | null, listener: (event: MediaQueryListEvent) => void) {
  if (!query) return;
  const target = query as MediaListenerTarget;
  if (target.addEventListener) target.addEventListener('change', listener);
  else target.addListener?.(listener);
}

function removeMediaListener(query: MediaQueryList | null, listener: (event: MediaQueryListEvent) => void) {
  if (!query) return;
  const target = query as MediaListenerTarget;
  if (target.removeEventListener) target.removeEventListener('change', listener);
  else target.removeListener?.(listener);
}

onMounted(() => {
  mobileQuery = window.matchMedia('(max-width: 720px), (pointer: coarse)');
  reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  syncMedia();
  resizeCanvas();

  window.addEventListener('resize', resizeCanvas);
  window.visualViewport?.addEventListener('resize', resizeCanvas);
  window.addEventListener('pointermove', updatePointer, { passive: true });
  window.addEventListener('pointerleave', resetPointer);
  document.addEventListener('beforeinput', boostFromTyping, true);
  document.addEventListener('input', boostFromTyping, true);
  document.addEventListener('keydown', boostFromKeydown, true);
  document.addEventListener('compositionupdate', boostFromTyping, true);
  document.addEventListener('compositionend', boostFromTyping, true);
  document.addEventListener('paste', boostFromTyping, true);
  document.addEventListener('change', boostFromTyping, true);
  document.addEventListener('focusin', boostFromFocus, true);
  addMediaListener(mobileQuery, handleMediaChange);
  addMediaListener(reduceMotionQuery, handleMediaChange);
  start();
});

onBeforeUnmount(() => {
  window.cancelAnimationFrame(rafId);
  window.removeEventListener('resize', resizeCanvas);
  window.visualViewport?.removeEventListener('resize', resizeCanvas);
  window.removeEventListener('pointermove', updatePointer);
  window.removeEventListener('pointerleave', resetPointer);
  document.removeEventListener('beforeinput', boostFromTyping, true);
  document.removeEventListener('input', boostFromTyping, true);
  document.removeEventListener('keydown', boostFromKeydown, true);
  document.removeEventListener('compositionupdate', boostFromTyping, true);
  document.removeEventListener('compositionend', boostFromTyping, true);
  document.removeEventListener('paste', boostFromTyping, true);
  document.removeEventListener('change', boostFromTyping, true);
  document.removeEventListener('focusin', boostFromFocus, true);
  removeMediaListener(mobileQuery, handleMediaChange);
  removeMediaListener(reduceMotionQuery, handleMediaChange);
});
</script>

<style scoped>
.auth-particle-canvas {
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  opacity: 0.96;
}

@media (max-width: 720px), (pointer: coarse) {
  .auth-particle-canvas {
    opacity: 1;
  }
}
</style>
