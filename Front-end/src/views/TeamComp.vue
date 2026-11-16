<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { BOARD_ROLES, organize, parsePower, partyTotal } from "../lib/board.js";
import { cancelRoster, loadMembers, loadRoster, moveRoster, placeMember, saveRoster, unplaceMember } from "../lib/session.js";

const PROFILE_KEY = "sxs-board-profile";

function readProfile() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROFILE_KEY) || "null");
    if (parsed && typeof parsed.nick === "string") return parsed;
  } catch { /* keep the empty profile */ }
  return null;
}

const profile = readProfile();
const nick = ref(profile?.nick || "");
const role = ref(BOARD_ROLES.includes(profile?.role) ? profile.role : BOARD_ROLES[0]);
const power = ref("");
const editingId = ref("");
const entries = ref([]);
const members = ref([]);
const membersError = ref("");
const message = ref("");
const messageIsSummary = ref(true);
const moveStatus = ref("");
const refreshStatus = ref("");
const saving = ref(false);
const refreshing = ref(false);
const dragId = ref("");
const dragOver = ref(null);
const dragPos = ref(null);
let dragSession = 0;

const board = computed(() => organize(entries.value));
const parties = computed(() => (board.value.parties.length ? board.value.parties : [BOARD_ROLES.map(() => null)]));
const bench = computed(() => {
  const placed = new Set(entries.value.map((entry) => entry.profileId).filter(Boolean));
  return members.value.filter((member) => !placed.has(member.profileId));
});
const mineEntries = computed(() => entries.value.filter((entry) => entry.mine));
const editing = computed(() => mineEntries.value.find((entry) => entry.id === editingId.value) || null);

function partyOf(entry) {
  return entries.value.find((item) => item.id === entry?.id)?.party || 0;
}

function apply(result, { note = false } = {}) {
  entries.value = Array.isArray(result.entries) ? result.entries : [];
  if (editingId.value && !mineEntries.value.some((entry) => entry.id === editingId.value)) {
    editingId.value = "";
  }
  if (note || messageIsSummary.value) {
    message.value = mineSummary();
    messageIsSummary.value = true;
  }
}

function mineSummary() {
  if (!mineEntries.value.length) return "아직 내가 등록한 캐릭터가 없어요. 여러 명을 이어서 등록할 수 있어요.";
  return mineEntries.value.map((entry) => `${entry.nick} · ${entry.party}파티`).join(" / ");
}

function remember() {
  localStorage.setItem(PROFILE_KEY, JSON.stringify({ nick: nick.value.trim(), role: role.value }));
}

function editEntry(entry) {
  editingId.value = entry.id;
  nick.value = entry.nick;
  role.value = entry.role;
  power.value = String(entry.power);
  message.value = mineSummary();
}

function startAnother() {
  editingId.value = "";
  nick.value = "";
  power.value = "";
  message.value = mineSummary();
}

async function refresh(manual = false) {
  if (refreshing.value || saving.value || dragId.value) return;
  refreshing.value = true;
  if (manual) refreshStatus.value = "명단 확인 중…";
  try {
    const [roster, rosterMembers] = await Promise.all([
      loadRoster(),
      loadMembers().catch(() => ({ members: [], failed: true })),
    ]);
    apply(roster, { note: manual || !message.value });
    members.value = Array.isArray(rosterMembers.members) ? rosterMembers.members : [];
    membersError.value = rosterMembers.failed ? "길드원 명단을 불러오지 못했어요. API를 다시 띄운 뒤 새로고침해 주세요." : "";
    if (manual) refreshStatus.value = "명단을 업데이트했어요.";
  } catch (err) {
    refreshStatus.value = manual ? "명단을 새로고침하지 못했어요." : (err.message || "명단을 불러오지 못했습니다.");
  } finally {
    refreshing.value = false;
  }
}

async function submit() {
  if (refreshing.value || saving.value) return;
  const nextNick = nick.value.trim();
  const nextPower = parsePower(power.value);
  if (!nextNick || !nextPower) {
    message.value = "닉네임과 올바른 전투력을 입력해 주세요.";
    messageIsSummary.value = false;
    return;
  }
  saving.value = true;
  const wasEdit = Boolean(editing.value);
  try {
    apply(await saveRoster({
      id: wasEdit ? editingId.value : undefined,
      nick: nextNick,
      role: role.value,
      power: power.value,
    }), { note: true });
    remember();
    if (!wasEdit) startAnother();
  } catch (err) {
    message.value = err.message || "참석 신청에 실패했습니다.";
    messageIsSummary.value = false;
  } finally {
    saving.value = false;
  }
}

async function cancel(entry) {
  if (refreshing.value || saving.value || !entry) return;
  saving.value = true;
  try {
    apply(await cancelRoster(entry.id), { note: true });
    if (editingId.value === entry.id) startAnother();
  } catch (err) {
    message.value = err.message || "참석 취소에 실패했습니다.";
    messageIsSummary.value = false;
  } finally {
    saving.value = false;
  }
}

function missing(party) {
  return BOARD_ROLES.filter((_, index) => !party[index]);
}

function dragged() {
  if (String(dragId.value).startsWith("member:")) {
    const member = members.value.find((item) => item.profileId === dragId.value.slice(7));
    return member ? { ...member, member: true, id: dragId.value } : null;
  }
  const entry = entries.value.find((item) => item.id === dragId.value);
  return entry ? { ...entry, member: false } : null;
}

function targetAt(x, y, source) {
  const stack = document.elementsFromPoint(x, y);
  if (stack.some((node) => node.classList?.contains("guild-card"))) return { bench: true };
  const row = stack.find((node) => node.classList?.contains("party-row"));
  if (row instanceof HTMLElement) {
    const rect = row.getBoundingClientRect();
    const onEdge = y < rect.top + 7 || y > rect.bottom - 7;
    if (!onEdge) {
      return { party: Number(row.dataset.party), roleIndex: Number(row.dataset.role) };
    }
    return null;
  }
  if (stack.some((node) => node.classList?.contains("party-slot"))) return null;
  const party = stack.find((node) => node.classList?.contains("party"));
  if (!(party instanceof HTMLElement) || !source) return null;
  return { party: Number(party.dataset.party), roleIndex: BOARD_ROLES.indexOf(source.role) };
}

function onPointerDown(entry, event) {
  if (!entry || event.button !== 0 || saving.value) return;
  startDrag(entry, event, () => entry);
}

function onMemberDown(member, event) {
  if (!member || event.button !== 0 || saving.value) return;
  startDrag({ ...member, member: true, id: `member:${member.profileId}` }, event, () => dragged());
}

function startDrag(entry, event, current) {
  event.preventDefault();
  const originX = event.clientX;
  const originY = event.clientY;
  const session = ++dragSession;
  let started = false;

  const move = (ev) => {
    if (session !== dragSession) return;
    if (!started) {
      if (Math.hypot(ev.clientX - originX, ev.clientY - originY) < 5) return;
      started = true;
      dragId.value = entry.member ? `member:${entry.profileId}` : entry.id;
      document.body.classList.add("board-dragging");
    }
    dragPos.value = { x: ev.clientX, y: ev.clientY };
    dragOver.value = targetAt(ev.clientX, ev.clientY, entry);
  };
  const end = (ev) => {
    if (session !== dragSession) return;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    document.body.classList.remove("board-dragging");
    const hit = started ? targetAt(ev.clientX, ev.clientY, current() || entry) : null;
    const source = current() || entry;
    dragId.value = "";
    dragPos.value = null;
    dragOver.value = null;
    if (!started || !hit || !source) return;
    if (hit.bench) {
      if (source.profileId && !source.member) finishUnplace(source);
      else if (!source.member) moveStatus.value = "참석 추가로 넣은 캐릭터는 참석 취소로 빼 주세요.";
      return;
    }
    if (source.member) {
      if (BOARD_ROLES[hit.roleIndex] !== source.role) {
        moveStatus.value = "같은 직업 자리에만 넣을 수 있어요.";
        return;
      }
      const party = parties.value[hit.party - 1] || [];
      if (party[hit.roleIndex]) {
        moveStatus.value = "그 자리에는 이미 같은 직업이 있어요.";
        return;
      }
      finishPlace(source, hit.party);
      return;
    }
    if (hit.party === source.party) return;
    if (BOARD_ROLES[hit.roleIndex] !== source.role) {
      moveStatus.value = "같은 직업끼리만 옮기거나 바꿀 수 있어요. 같은 직업이 두 명이 되는 자리는 바꿀 수 없어요.";
      return;
    }
    finishMove(source, hit.party);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
}

async function finishPlace(member, partyNumber) {
  if (!member || saving.value) return;
  saving.value = true;
  moveStatus.value = "";
  try {
    apply(await placeMember({ profileId: member.profileId, party: partyNumber }));
    moveStatus.value = `${member.nick} 님을 ${partyNumber}파티에 넣었어요.`;
  } catch (err) {
    moveStatus.value = err.message || "길드원을 파티에 넣지 못했어요.";
  } finally {
    saving.value = false;
    dragId.value = "";
    dragOver.value = null;
  }
}

async function finishUnplace(entry) {
  if (!entry || saving.value) return;
  saving.value = true;
  moveStatus.value = "";
  try {
    apply(await unplaceMember(entry.id));
    moveStatus.value = `${entry.nick} 님을 파티에서 빼 길드원으로 돌렸어요.`;
  } catch (err) {
    moveStatus.value = err.message || "파티에서 빼지 못했어요.";
  } finally {
    saving.value = false;
    dragId.value = "";
    dragOver.value = null;
  }
}

async function finishMove(source, partyNumber) {
  if (!source || source.party === partyNumber || saving.value) return;
  saving.value = true;
  moveStatus.value = "";
  try {
    apply(await moveRoster({ id: source.id, party: partyNumber }));
    moveStatus.value = `${source.nick} 님을 ${partyOf(source) || partyNumber}파티로 옮겼어요.`;
  } catch (err) {
    moveStatus.value = err.message || "파티를 옮기지 못했어요.";
  } finally {
    saving.value = false;
    dragId.value = "";
    dragOver.value = null;
  }
}

function rowClass(partyNumber, roleIndex, entry) {
  const source = dragged();
  const over = dragOver.value?.party === partyNumber && dragOver.value?.roleIndex === roleIndex;
  const role = BOARD_ROLES[roleIndex];
  const memberDrop = Boolean(source?.member && source.role === role && !entry);
  const sameRole = Boolean(source && !source.member && source.role === role && source.party !== partyNumber);
  return {
    dragging: entry?.id === dragId.value,
    "can-drop": memberDrop || sameRole,
    "drop-ok": Boolean(over && (memberDrop || sameRole)),
    "drop-bad": Boolean(over && source && source.role !== role),
  };
}

let timer = 0;
function onVisible() {
  if (!document.hidden) refresh();
}

onMounted(() => {
  refresh();
  timer = window.setInterval(() => {
    if (!document.hidden) refresh();
  }, 60000);
  document.addEventListener("visibilitychange", onVisible);
});

onUnmounted(() => {
  window.clearInterval(timer);
  document.removeEventListener("visibilitychange", onVisible);
});
</script>

<template>
  <header class="board-head">
    <span>캣길드</span>
    <h1 class="page-title">4대4 챌린지 파티 현황</h1>
    <p class="lede">한 사람이 여러 캐릭터를 등록할 수 있어요. 같은 직업끼리 끌어다 놓아 파티를 옮기거나 바꾸세요.</p>
  </header>

  <div class="board">
    <div class="stack">
    <section class="card">
      <h2>내 참석 신청</h2>
      <form @submit.prevent="submit">
        <label class="field">
          <span>인게임 닉네임</span>
          <input v-model="nick" maxlength="24" placeholder="닉네임 입력" required />
        </label>
        <label class="field">
          <span>직업</span>
          <select v-model="role">
            <option v-for="name in BOARD_ROLES" :key="name" :value="name">{{ name }}</option>
          </select>
        </label>
        <label class="field">
          <span>전투력</span>
          <input v-model="power" inputmode="numeric" maxlength="24" placeholder="예: 580000 또는 58만" required />
        </label>
        <button class="btn primary board-submit" type="submit" :disabled="saving">
          {{ editing ? "참석 정보 수정" : "참석 추가" }}
        </button>
      </form>
      <p class="status">{{ message }}</p>
      <button v-if="editing" class="btn" type="button" :disabled="saving" @click="startAnother">다른 캐릭터 추가</button>
      <ul v-if="mineEntries.length" class="mine-list">
        <li v-for="entry in mineEntries" :key="entry.id">
          <button class="who" :class="{ on: entry.id === editingId }" type="button" @click="editEntry(entry)">
            {{ entry.nick }} · {{ entry.role }} · {{ entry.party }}파티
          </button>
          <button class="btn" type="button" :disabled="saving" @click="cancel(entry)">참석 취소</button>
        </li>
      </ul>
    </section>

    <section class="card guild-card">
      <h2>길드원</h2>
      <p class="hint">가입한 사용자의 닉네임과 직업입니다. 같은 직업 칸으로 끌어다 넣고, 이 영역으로 다시 끌어오면 파티에서 빠집니다.</p>
      <div class="guild-bench" :class="{ 'drop-ok': dragOver?.bench && dragged()?.profileId && !dragged()?.member }">
        <button
          v-for="member in bench"
          :key="member.profileId"
          type="button"
          class="guild-chip"
          :class="['r' + BOARD_ROLES.indexOf(member.role), { dragging: dragId === `member:${member.profileId}` }]"
          @pointerdown="onMemberDown(member, $event)"
        >
          {{ member.nick }}
        </button>
        <p v-if="membersError" class="status">{{ membersError }}</p>
        <p v-else-if="!bench.length" class="status">대기 중인 길드원이 없어요.</p>
      </div>
    </section>
    </div>

    <section>
      <div class="board-title">
        <h2>파티 현황</h2>
        <span class="status">참석 {{ entries.length }}명</span>
      </div>
      <div class="counts">
        <span v-for="(queue, index) in board.queues" :key="BOARD_ROLES[index]" class="chip" :class="'r' + index">
          {{ BOARD_ROLES[index] }} {{ queue.length }}명
        </span>
      </div>
      <div class="row">
        <button class="btn" type="button" :disabled="refreshing || saving" @click="refresh(true)">새로고침</button>
        <span class="status">{{ refreshStatus }}</span>
      </div>
      <p class="hint">같은 직업 자리로만 옮길 수 있어요. 다른 직업 자리에 놓으면 그 파티에 같은 직업이 두 명이 되어 바뀌지 않아요.</p>
      <p class="status move-status">{{ moveStatus }}</p>
      <article
        v-for="(party, index) in parties"
        :key="index"
        class="card party"
        :data-party="index + 1"
      >
        <div class="board-title">
          <h3>
            {{ index + 1 }}파티
            <span class="party-power">투력 {{ partyTotal(party).toLocaleString("ko-KR") }}</span>
          </h3>
          <span class="status">{{ missing(party).length ? missing(party).join(" · ") + " 필요" : "4/4 · 편성 완료" }}</span>
        </div>
        <div v-for="(entry, roleIndex) in party" :key="roleIndex" class="party-slot">
          <div
            class="party-row"
            role="listitem"
            :aria-label="entry ? `${BOARD_ROLES[roleIndex]} ${entry.nick}` : `${BOARD_ROLES[roleIndex]} 빈자리`"
            :data-party="index + 1"
            :data-role="roleIndex"
            :class="[rowClass(index + 1, roleIndex, entry), { filled: Boolean(entry) }]"
            @pointerdown="onPointerDown(entry, $event)"
          >
            <span class="role" :class="'r' + roleIndex">{{ BOARD_ROLES[roleIndex] }}</span>
            <b :class="{ mine: entry?.mine }">{{ entry ? entry.nick + (entry.mine ? " · 나" : "") : "빈자리" }}</b>
            <span class="status">{{ entry?.power ? entry.power.toLocaleString("ko-KR") : "—" }}</span>
          </div>
        </div>
      </article>
    </section>
  </div>
  <div v-if="dragPos && dragged()" class="drag-ghost" :style="{ left: `${dragPos.x}px`, top: `${dragPos.y}px` }">
    {{ dragged().role }} · {{ dragged().nick }}
  </div>
</template>