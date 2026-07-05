<script setup lang="ts">
definePageMeta({
  title: '库存归档'
})
</script>

<template>
  <section class="inventory-archive" aria-label="库存系统归档">
    <div class="inventory-archive__panel">
      <div class="inventory-archive__mark" aria-hidden="true">I</div>
      <div class="inventory-archive__content">
        <p class="inventory-archive__eyebrow">旧库存系统已停止扩展</p>
        <h2>库存页面已归档</h2>
        <p>
          当前经营口径已切换到并行利润系统。商品不再按机台拆库存，进货作为成本来源，
          销售作为收入来源，毛利依据成本快照计算。
        </p>
        <div class="inventory-archive__actions">
          <NuxtLink class="inventory-archive__link inventory-archive__link--primary" to="/dashboard">
            查看利润仪表盘
          </NuxtLink>
          <NuxtLink class="inventory-archive__link" to="/products">
            查看全局商品
          </NuxtLink>
        </div>
      </div>
    </div>

    <div class="inventory-archive__grid">
      <article class="inventory-archive__item">
        <span>进货</span>
        <strong>成本凭证</strong>
        <NuxtLink to="/purchases">打开进货账簿</NuxtLink>
      </article>
      <article class="inventory-archive__item">
        <span>销售</span>
        <strong>收入记录</strong>
        <NuxtLink to="/sales">打开销售账簿</NuxtLink>
      </article>
      <article class="inventory-archive__item">
        <span>商品</span>
        <strong>全局档案</strong>
        <NuxtLink to="/products">打开商品档案</NuxtLink>
      </article>
    </div>
  </section>
</template>

<style scoped>
.inventory-archive {
  min-width: 0;
  display: grid;
  gap: var(--space-4);
}

.inventory-archive__panel {
  min-width: 0;
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  gap: var(--space-4);
  align-items: start;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-3);
  padding: var(--space-5);
  background: var(--color-surface);
}

.inventory-archive__mark {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  background: var(--color-surface-muted);
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: 18px;
  font-weight: 900;
}

.inventory-archive__content {
  min-width: 0;
  display: grid;
  gap: var(--space-3);
}

.inventory-archive__eyebrow {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 800;
}

.inventory-archive h2 {
  margin: 0;
  color: var(--color-text);
  font-size: 24px;
  line-height: 1.25;
}

.inventory-archive p {
  max-width: 760px;
  margin: 0;
  color: var(--color-text-muted);
  font-size: 14px;
  line-height: 1.7;
}

.inventory-archive__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.inventory-archive__link {
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: 0 var(--space-3);
  background: var(--color-surface);
  color: var(--color-text);
  text-decoration: none;
  font-size: 14px;
  font-weight: 800;
}

.inventory-archive__link--primary {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: #ffffff;
}

.inventory-archive__grid {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
}

.inventory-archive__item {
  min-width: 0;
  display: grid;
  gap: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-3);
  padding: var(--space-4);
  background: var(--color-surface);
}

.inventory-archive__item span {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 800;
}

.inventory-archive__item strong {
  color: var(--color-text);
  font-size: 18px;
  line-height: 1.3;
}

.inventory-archive__item a {
  color: var(--color-primary);
  font-size: 13px;
  font-weight: 800;
  text-decoration: none;
}

@media (max-width: 760px) {
  .inventory-archive {
    gap: var(--space-3);
  }

  .inventory-archive__panel {
    grid-template-columns: 1fr;
    padding: var(--space-4);
  }

  .inventory-archive__mark {
    width: 44px;
    height: 44px;
    font-size: 15px;
  }

  .inventory-archive h2 {
    font-size: 20px;
  }

  .inventory-archive__actions {
    display: grid;
    grid-template-columns: 1fr;
  }

  .inventory-archive__link {
    min-height: 44px;
  }

  .inventory-archive__grid {
    grid-template-columns: 1fr;
  }

  .inventory-archive__item {
    padding: var(--space-3);
  }
}
</style>
