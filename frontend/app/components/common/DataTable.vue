<script setup lang="ts">
type DataTableColumn = {
  key: string
  label: string
  align?: 'left' | 'right' | 'center'
}

type DataTableRow = Record<string, string | number>

const props = withDefaults(defineProps<{
  columns?: readonly DataTableColumn[]
  rows?: readonly DataTableRow[]
  loading?: boolean
  emptyText?: string
}>(), {
  columns: () => [
    { key: 'name', label: '项目' },
    { key: 'status', label: '状态' },
    { key: 'updatedAt', label: '更新时间', align: 'right' }
  ],
  rows: () => [],
  loading: false,
  emptyText: '暂无数据'
})

function cellClass(column: DataTableColumn) {
  return [
    'data-table__cell',
    column.align ? `data-table__cell--${column.align}` : 'data-table__cell--left'
  ]
}
</script>

<template>
  <div class="data-table">
    <div class="data-table__scroll">
      <table class="data-table__table">
        <thead>
          <tr>
            <th
              v-for="column in props.columns"
              :key="column.key"
              :class="cellClass(column)"
              scope="col"
            >
              {{ column.label }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="props.loading">
            <td class="data-table__empty" :colspan="props.columns.length">
              加载中
            </td>
          </tr>
          <tr v-else-if="props.rows.length === 0">
            <td class="data-table__empty" :colspan="props.columns.length">
              {{ props.emptyText }}
            </td>
          </tr>
          <tr v-for="(row, rowIndex) in props.rows" v-else :key="rowIndex">
            <td
              v-for="column in props.columns"
              :key="column.key"
              :class="cellClass(column)"
            >
              {{ row[column.key] }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.data-table {
  min-width: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-3);
  background: var(--color-surface);
}

.data-table__scroll {
  max-width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.data-table__table {
  width: 100%;
  min-width: 640px;
  border-collapse: collapse;
}

.data-table__cell {
  height: 46px;
  padding: 0 var(--space-4);
  border-bottom: 1px solid var(--color-border);
  text-align: left;
  white-space: nowrap;
}

th.data-table__cell {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--color-surface-subtle);
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 800;
}

.data-table__cell--right {
  text-align: right;
}

.data-table__cell--center {
  text-align: center;
}

.data-table__empty {
  height: 88px;
  padding: var(--space-4);
  color: var(--color-text-muted);
  text-align: center;
}

tbody tr:last-child .data-table__cell {
  border-bottom: 0;
}
</style>
