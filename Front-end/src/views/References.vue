<script setup>
const sites = [
  { name: "Purrwikimania", href: "https://www.purrwikimania.com/", icon: "/site-icons/purr.svg" },
  { name: "SxS 위키", href: "https://sxswiki-ledin-kr.netlify.app/", icon: "/site-icons/wiki.svg" },
  { name: "Sword x Staff Compass", href: "https://swordxstaff-compass.com/", icon: "/site-icons/compass.png" },
  { name: "Prydwen", href: "https://www.prydwen.gg/sword-x-staff", icon: "/site-icons/prydwen.png" },
];
</script>

<template>
  <header>
    <h1 class="page-title">참고 사이트</h1>
    <p class="lede">소드 x 스태프 공략과 정보를 모아 둔 사이트입니다.</p>
  </header>
  <div class="ref-list">
    <a
      v-for="site in sites"
      :key="site.href"
      class="btn ref-link"
      :href="site.href"
      target="_blank"
      rel="noopener noreferrer"
    >
      <img :src="site.icon" alt="" />
      <span>{{ site.name }}</span>
    </a>
  </div>
</template>

<style scoped>
.ref-list {
  display: grid;
  grid-template-columns: repeat(2, 280px);
  gap: 12px;
  margin-top: 22px;
  width: max-content;
  max-width: 100%;
}
.ref-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 40px;
  color: var(--text);
  text-decoration: none;
}
.ref-link img {
  width: 20px;
  height: 20px;
  object-fit: contain;
  flex: none;
}
@media (max-width: 640px) {
  .ref-list { grid-template-columns: minmax(0, 1fr); width: 100%; }
}
</style>
