<script setup>
defineProps({
  pinned: { type: Boolean, required: true },
  expanded: { type: Boolean, required: true },
  page: { type: String, required: true },
  guildName: { type: String, default: "" },
  nickname: { type: String, default: "" },
});

const emit = defineEmits(["toggle-pin", "hover", "navigate"]);

const items = [
  { id: "spec", label: "스펙 계산", icon: "calc" },
  { id: "team", label: "4 vs 4 팀 구성", icon: "team" },
];
</script>

<template>
  <aside
    class="sidebar"
    :class="{ expanded, pinned }"
    @mouseenter="emit('hover', true)"
    @mouseleave="emit('hover', false)"
  >
    <div class="panel">
    <div class="brand">
      <span class="crest" aria-hidden="true">🐱</span>
      <div v-show="expanded" class="who">
        <strong>{{ guildName }}</strong>
        <span>{{ nickname || "게스트" }}</span>
      </div>
      <div v-show="expanded" class="brand-side">
        <button
          class="pin"
          type="button"
          :aria-pressed="pinned"
          :title="pinned ? '고정 해제' : '사이드바 고정'"
          @click="emit('toggle-pin')"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M14.5 3.5 20.5 9.5l-1.2 1.2-2.4-.6-3.2 3.2.8 2.3-1.4 1.4-3.6-3.6-4.2 4.2-1.4-1.4 4.2-4.2-3.6-3.6 1.4-1.4 2.3.8 3.2-3.2-.6-2.4 1.2-1.2Z"
            />
          </svg>
        </button>
        <button class="auth" type="button" @click="emit('auth')">{{ nickname ? "로그아웃" : "로그인" }}</button>
      </div>
    </div>
    <nav>
      <button
        v-for="item in items"
        :key="item.id"
        type="button"
        :class="{ current: page === item.id }"
        :title="item.label"
        @click="emit('navigate', item.id)"
      >
        <svg v-if="item.icon === 'calc'" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="5" y="3" width="14" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.6" />
          <path d="M8 8h8M8 12h8M8 16h5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        </svg>
        <svg v-else viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="7" cy="8" r="2" fill="none" stroke="currentColor" stroke-width="1.6" />
          <circle cx="17" cy="8" r="2" fill="none" stroke="currentColor" stroke-width="1.6" />
          <path d="M4 18c.4-2.4 2-3.5 3.8-3.5S11.2 15.6 11.6 18M12.4 18c.4-2.4 2-3.5 3.8-3.5S19.6 15.6 20 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        </svg>
        <span v-show="expanded">{{ item.label }}</span>
      </button>
    </nav>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 76px;
  flex: none;
  position: sticky;
  top: 0;
  height: 100vh;
  z-index: 2;
}
.sidebar.pinned { width: 248px; }
.panel {
  width: 76px;
  height: 100vh;
  background: var(--sidebar);
  border-right: 1px solid var(--sidebar-line);
  padding: 14px 10px;
  transition: width 0.16s ease;
}
.sidebar.expanded .panel { width: 248px; }
.sidebar.expanded:not(.pinned) .panel {
  position: absolute;
  left: 0;
  top: 0;
  box-shadow: 12px 0 32px rgba(0, 0, 0, 0.35);
}
.brand {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-height: 54px;
  margin-bottom: 14px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--sidebar-line);
}
.sidebar:not(.expanded) .brand {
  border-bottom: 0;
  margin-bottom: 16px;
  padding-bottom: 0;
  justify-content: center;
}
.crest {
  flex: none;
  font-family: "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif;
  font-size: 36px;
  line-height: 1;
}
.who { min-width: 0; align-self: center; }
.who strong,
.who span { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.who strong { font-size: 14px; font-weight: 650; line-height: 1.25; }
.who span { margin-top: 2px; color: var(--muted); font-size: 12px; }
.brand-side { margin-left: auto; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
.pin {
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 8px;
  background: #2a241c;
  color: var(--accent);
  display: grid;
  place-items: center;
}
.pin:hover { filter: brightness(1.08); }
.pin svg { width: 16px; height: 16px; fill: currentColor; }
.auth {
  border: 0;
  background: transparent;
  color: var(--text);
  font-size: 13px;
  line-height: 1;
  padding: 0 2px;
}
.auth:hover { color: var(--accent); }
nav { display: flex; flex-direction: column; gap: 4px; }
nav button {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  border: 0;
  background: transparent;
  border-radius: 12px;
  padding: 11px 12px;
  color: var(--muted);
  text-align: left;
}
nav button svg { width: 20px; height: 20px; flex: none; }
nav button.current { background: #2a241c; color: var(--text); }
nav button:hover { background: #23262d; color: var(--text); }
nav span { white-space: nowrap; }
</style>
