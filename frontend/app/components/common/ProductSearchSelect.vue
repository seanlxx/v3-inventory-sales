<script setup lang="ts">
import type { Product } from '~/types/product'

const modelValue = defineModel<string>({ default: '' })

const props = defineProps<{
  products: readonly Product[]
  placeholder?: string
}>()

const emit = defineEmits<{
  change: [productId: string]
}>()

const searchQuery = shallowRef('')
const isOpen = shallowRef(false)
const selectRef = shallowRef<HTMLDivElement | null>(null)

const filteredProducts = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return props.products
  return props.products.filter(product =>
    product.name.toLowerCase().includes(query) ||
    product.id.toLowerCase().includes(query)
  )
})

const selectedProduct = computed(() =>
  props.products.find(p => p.id === modelValue.value)
)

function selectProduct(productId: string) {
  modelValue.value = productId
  emit('change', productId)
  isOpen.value = false
  searchQuery.value = ''
}

function toggleDropdown() {
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    nextTick(() => {
      const input = selectRef.value?.querySelector('input')
      input?.focus()
    })
  }
}

function handleClickOutside(event: MouseEvent) {
  if (selectRef.value && !selectRef.value.contains(event.target as Node)) {
    isOpen.value = false
    searchQuery.value = ''
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div ref="selectRef" class="product-search-select">
    <button
      type="button"
      class="product-search-select__trigger"
      @click="toggleDropdown"
    >
      <span class="product-search-select__value">
        {{ selectedProduct?.name || props.placeholder || '选择商品' }}
      </span>
      <svg
        class="product-search-select__icon"
        :class="{ 'product-search-select__icon--open': isOpen }"
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>

    <div v-if="isOpen" class="product-search-select__dropdown">
      <div class="product-search-select__search">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索商品名称..."
          class="product-search-select__input"
          @click.stop
        >
      </div>
      <div class="product-search-select__list">
        <button
          v-for="product in filteredProducts"
          :key="product.id"
          type="button"
          class="product-search-select__option"
          :class="{ 'product-search-select__option--selected': product.id === modelValue }"
          @click="selectProduct(product.id)"
        >
          {{ product.name }}
        </button>
        <div v-if="filteredProducts.length === 0" class="product-search-select__empty">
          未找到匹配的商品
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.product-search-select {
  position: relative;
  width: 100%;
  min-width: 0;
}

.product-search-select__trigger {
  width: 100%;
  min-width: 0;
  min-height: 38px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: 0 var(--space-2);
  background: var(--color-surface);
  color: var(--color-text);
  text-align: left;
  cursor: pointer;
}

.product-search-select__trigger:hover {
  border-color: var(--color-primary);
}

.product-search-select__value {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.product-search-select__icon {
  flex-shrink: 0;
  color: var(--color-text-muted);
  transition: transform 0.2s;
}

.product-search-select__icon--open {
  transform: rotate(180deg);
}

.product-search-select__dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 100;
  display: grid;
  gap: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  background: var(--color-surface);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  max-height: 320px;
  overflow: hidden;
}

.product-search-select__search {
  padding: var(--space-2);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface-subtle);
}

.product-search-select__input {
  width: 100%;
  min-width: 0;
  min-height: 36px;
  box-sizing: border-box;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: 0 var(--space-2);
  background: var(--color-surface);
  color: var(--color-text);
}

.product-search-select__input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.product-search-select__list {
  max-height: 260px;
  overflow-y: auto;
}

.product-search-select__option {
  width: 100%;
  min-width: 0;
  min-height: 40px;
  box-sizing: border-box;
  display: block;
  border: 0;
  padding: 0 var(--space-3);
  background: var(--color-surface);
  color: var(--color-text);
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.product-search-select__option:hover {
  background: var(--color-surface-subtle);
}

.product-search-select__option--selected {
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-weight: 600;
}

.product-search-select__empty {
  padding: var(--space-3);
  color: var(--color-text-muted);
  text-align: center;
  font-size: 13px;
}

@media (max-width: 760px) {
  .product-search-select__trigger {
    min-height: var(--control-height-mobile);
  }
}
</style>
