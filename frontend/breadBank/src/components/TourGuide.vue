<template>
  <div v-if="modelValue" class="tour-root">
    <!-- Dim + spotlight cut-out around the highlighted element -->
    <div class="tour-spotlight" :class="{ 'is-centered': !rect }" :style="spotlightStyle"></div>

    <!-- Explanation card -->
    <div class="tour-card" :style="cardStyle">
      <div class="tour-count">{{ index + 1 }} of {{ steps.length }}</div>
      <div class="tour-title">{{ current?.title }}</div>
      <div class="tour-body">{{ current?.body }}</div>

      <div class="tour-dots">
        <span v-for="(s, i) in steps" :key="i" class="tour-dot" :class="{ 'is-active': i === index }"></span>
      </div>

      <div class="tour-actions">
        <button class="tour-skip" @click="finish">Skip</button>
        <div class="tour-btns">
          <button v-if="index > 0" class="tour-back" @click="prev">Back</button>
          <button class="tour-next" @click="next">{{ index === steps.length - 1 ? 'Done' : 'Next' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
export interface TourStep {
  target: string | null; // CSS selector to highlight, or null for a centered card
  title: string;
  body: string;
}
</script>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';

const props = defineProps<{ modelValue: boolean; steps: TourStep[] }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>();

const index = ref(0);
const rect = ref<{ top: number; left: number; width: number; height: number } | null>(null);
const current = computed(() => props.steps[index.value]);

function measure() {
  const step = props.steps[index.value];
  const el = step?.target ? document.querySelector<HTMLElement>(step.target) : null;
  if (!el) { rect.value = null; return; }
  el.scrollIntoView({ block: 'center', inline: 'nearest' });
  // Read the position after the (instant) scroll settles.
  setTimeout(() => {
    const r = el.getBoundingClientRect();
    rect.value = r.width || r.height ? { top: r.top, left: r.left, width: r.width, height: r.height } : null;
  }, 60);
}

const PAD = 8;
const spotlightStyle = computed(() => {
  if (!rect.value) return {};
  return {
    top: `${rect.value.top - PAD}px`,
    left: `${rect.value.left - PAD}px`,
    width: `${rect.value.width + PAD * 2}px`,
    height: `${rect.value.height + PAD * 2}px`,
  };
});

const cardStyle = computed(() => {
  if (!rect.value) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  const cardW = Math.min(320, window.innerWidth - 24);
  const below = rect.value.top + rect.value.height + 14;
  const roomBelow = window.innerHeight - below;
  let left = rect.value.left + rect.value.width / 2 - cardW / 2;
  left = Math.max(12, Math.min(left, window.innerWidth - cardW - 12));
  return roomBelow > 190
    ? { top: `${below}px`, left: `${left}px` }
    : { top: `${rect.value.top - 14}px`, left: `${left}px`, transform: 'translateY(-100%)' };
});

function next() { if (index.value < props.steps.length - 1) index.value++; else finish(); }
function prev() { if (index.value > 0) index.value--; }
function finish() { emit('update:modelValue', false); }

watch(index, () => { void nextTick(measure); });
watch(() => props.modelValue, (v) => {
  if (v) { index.value = 0; void nextTick(() => setTimeout(measure, 80)); }
});

function onResize() { if (props.modelValue) measure(); }
onMounted(() => { window.addEventListener('resize', onResize); window.addEventListener('scroll', onResize, true); });
onBeforeUnmount(() => { window.removeEventListener('resize', onResize); window.removeEventListener('scroll', onResize, true); });
</script>

<style scoped lang="scss">
.tour-root { position: fixed; inset: 0; z-index: 9000; }

/* The dim + spotlight: a box with a huge shadow darkens everything outside it. */
.tour-spotlight {
  position: fixed; border-radius: 14px; pointer-events: none;
  box-shadow: 0 0 0 9999px rgba(8, 8, 22, 0.78);
  border: 2px solid rgba(140, 111, 236, 0.9);
  transition: top 0.25s ease, left 0.25s ease, width 0.25s ease, height 0.25s ease;
}
/* Centered steps (no target): full-screen dim, no cut-out. */
.tour-spotlight.is-centered {
  inset: 0; width: auto; height: auto; border: none; border-radius: 0;
  box-shadow: none; background: rgba(8, 8, 22, 0.82);
}

.tour-card {
  position: fixed; width: min(320px, calc(100vw - 24px));
  background: #14143a; border: 1px solid rgba(140, 111, 236, 0.35);
  border-radius: 16px; padding: 18px 18px 14px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
  color: var(--bb-text-soft);
}
.tour-count { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--bb-accent-light); font-weight: 700; }
.tour-title { font-size: 16px; font-weight: 700; color: var(--bb-text); margin: 6px 0 8px; }
.tour-body  { font-size: 13px; line-height: 1.5; color: var(--bb-text-soft); }

.tour-dots { display: flex; gap: 6px; margin: 14px 0 12px; }
.tour-dot  { width: 6px; height: 6px; border-radius: 999px; background: rgba(255,255,255,0.18); transition: all 0.2s; }
.tour-dot.is-active { width: 18px; background: var(--bb-accent-light); }

.tour-actions { display: flex; align-items: center; justify-content: space-between; }
.tour-btns { display: flex; gap: 8px; }
.tour-skip, .tour-back, .tour-next {
  border: none; cursor: pointer; font-size: 13px; font-weight: 600;
  border-radius: 999px; padding: 8px 16px;
}
.tour-skip { background: transparent; color: var(--bb-text-dim); padding-left: 0; }
.tour-back { background: rgba(255,255,255,0.08); color: var(--bb-text-soft); }
.tour-next { background: linear-gradient(135deg,var(--bb-accent),var(--bb-accent-2)); color: var(--bb-on-accent); }
.tour-next:hover, .tour-back:hover { filter: brightness(1.1); }
</style>
