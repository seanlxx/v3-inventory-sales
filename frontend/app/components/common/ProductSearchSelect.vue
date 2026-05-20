<script setup lang="ts">
import type { Product } from '~/types/product'

const props = defineProps<{
  modelValue?: string
  products: readonly Product[]
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [productId: string]
  change: [productId: string]
}>()

const searchQuery = shallowRef('')
const isOpen = shallowRef(false)
const selectRef = shallowRef<HTMLDivElement | null>(null)
const dropdownTop = shallowRef(0)
const dropdownLeft = shallowRef(0)
const dropdownWidth = shallowRef(0)

const filteredProducts = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return props.products
  return props.products.filter(product =>
    product.name.toLowerCase().includes(query) ||
    product.id.toLowerCase().includes(query)
  )
})

const visibleProducts = computed(() =>
  filteredProducts.value.length > 0 ? filteredProducts.value : props.products
)

const hasNoSearchResults = computed(() =>
  searchQuery.value.trim().length > 0 && filteredProducts.value.length === 0
)

const selectedProduct = computed(() =>
  props.products.find(p => p.id === props.modelValue)
)

const dropdownStyle = computed(() => ({
  top: `${dropdownTop.value}px`,
  left: `${dropdownLeft.value}px`,
  width: `${dropdownWidth.value}px`
}))

function updateDropdownPosition() {
  if (!isOpen.value) return
  const rect = selectRef.value?.getBoundingClientRect()
  if (!rect) return
  dropdownTop.value = rect.bottom + 4
  dropdownLeft.value = rect.left
  dropdownWidth.value = rect.width
}

function selectProduct(productId: string) {
  emit('update:modelValue', productId)
  emit('change', productId)
  isOpen.value = false
  searchQuery.value = ''
}

function toggleDropdown() {
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    nextTick(() => {
      updateDropdownPosition()
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
  window.addEventListener('resize', updateDropdownPosition)
  window.addEventListener('scroll', updateDropdownPosition, true)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  window.removeEventListener('resize', updateDropdownPosition)
  window.removeEventListener('scroll', updateDropdownPosition, true)
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

    <div v-if="isOpen" class="product-search-select__dropdown" :style="dropdownStyle">
      <div class="product-search-select__search">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索商品名称..."
          class="product-search-select__input"
          @click.stop
        >
      </div>
      <div v-if="hasNoSearchResults" class="product-search-select__empty">
        未找到匹配商品，可从全部商品中选择
      </div>
      <div v-if="visibleProducts.length > 0" class="product-search-select__list">
        <button
          v-for="product in visibleProducts"
          :key="product.id"
          type="button"
          class="product-search-select__option"
          :class="{ 'product-search-select__option--selected': product.id === props.modelValue }"
          @click="selectProduct(product.id)"
        >
          {{ product.name }}
        </button>
      </div>
      <div v-else class="product-search-select__empty">
        商品库暂无可选商品
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
  position: fixed;
  z-index: 1000;
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
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-muted);
  text-align: left;
  font-size: 13px;
}

@media (max-width: 760px) {
  .product-search-select__trigger {
    min-height: var(--control-height-mobile);
  }
}
</style>
