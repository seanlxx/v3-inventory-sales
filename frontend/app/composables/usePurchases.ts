import type { ApiError } from '~/types/api'
import type { PurchaseAiCandidate, PurchaseListFilters, PurchaseOrder, PurchaseOrderPayload } from '~/types/purchase'
import type { Product } from '~/types/product'

const defaultFilters: PurchaseListFilters = {
  month: new Date().toISOString().slice(0, 7),
  status: 'active',
  search: ''
}

function matchesPurchaseSearch(order: PurchaseOrder, search: string) {
  const keyword = search.trim().toLowerCase()
  if (!keyword) return true
  const items = order.items.map(item => item.productName || item.productId).join(' ')
  return `${order.id} ${order.source || ''} ${order.note || ''} ${order.machineId} ${items}`.toLowerCase().includes(keyword)
}

function readFileAsBase64(file: File) {
  return new Promise<{ imageBase64: string; mimeType: string }>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const value = String(reader.result || '')
      resolve({
        imageBase64: value.includes(',') ? value.split(',').pop() || '' : value,
        mimeType: file.type || 'image/jpeg'
      })
    }
    reader.onerror = () => reject(reader.error || new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
}

function extractJsonObject(text: string) {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1)) as { items?: Array<Record<string, unknown>> }
  } catch {
    return null
  }
}

function normalizeAiCandidates(rawItems: Array<Record<string, unknown>>, products: readonly Product[]): PurchaseAiCandidate[] {
  return rawItems.map((item, index) => {
    const rawName = String(item.rawName || item.name || item.productName || '').trim()
    const matchedProduct = products.find(product =>
      product.name === item.productName ||
      product.name === rawName ||
      product.name.includes(rawName) ||
      rawName.includes(product.name)
    )
    const quantity = Math.max(1, Number(item.quantity) || 1)
    const totalPrice = Math.max(0, Number(item.totalPrice) || 0)
    const unitPrice = Math.max(0, Number(item.unitPrice) || (totalPrice > 0 ? totalPrice / quantity : 0))
    return {
      id: `ai-${index}-${rawName || 'item'}`,
      rawName: rawName || '未命名商品',
      productId: matchedProduct?.id || '',
      productName: matchedProduct?.name || rawName || '',
      confidence: matchedProduct ? 'medium' : 'low',
      quantity,
      unitPrice,
      totalPrice: totalPrice || unitPrice * quantity,
      issue: matchedProduct ? '' : '未匹配商品'
    }
  })
}

export function usePurchases() {
  const { request } = useApi()
  const toastStore = useToastStore()

  const orders = shallowRef<PurchaseOrder[]>([])
  const products = shallowRef<Product[]>([])
  const filters = reactive<PurchaseListFilters>({ ...defaultFilters })
  const selectedOrder = shallowRef<PurchaseOrder | null>(null)
  const aiCandidates = shallowRef<PurchaseAiCandidate[]>([])
  const receiptImage = shallowRef<{ imageBase64: string; mimeType: string; fileName: string } | null>(null)
  const loading = shallowRef(false)
  const productsLoading = shallowRef(false)
  const saving = shallowRef(false)
  const voiding = shallowRef(false)
  const recognizing = shallowRef(false)
  const error = shallowRef<ApiError | null>(null)
  const productsError = shallowRef<ApiError | null>(null)
  const aiError = shallowRef<ApiError | null>(null)

  const filteredOrders = computed(() =>
    orders.value.filter(order => matchesPurchaseSearch(order, filters.search))
  )

  const summary = computed(() =>
    filteredOrders.value.reduce((result, order) => {
      if (order.status === 'voided') return result
      result.totalCost += Number(order.totalCost) || 0
      result.quantity += Number(order.quantity) || 0
      result.count += 1
      return result
    }, { totalCost: 0, quantity: 0, count: 0 })
  )

  const machineOptions = computed(() => {
    const machines = new Set(products.value.map(product => product.machineId).filter(Boolean))
    if (machines.size === 0) {
      machines.add('1号机')
      machines.add('2号机')
    }
    return Array.from(machines).sort((left, right) => left.localeCompare(right, 'zh-CN'))
  })

  function updateFilters(nextFilters: Partial<PurchaseListFilters>) {
    Object.assign(filters, nextFilters)
  }

  async function loadProducts() {
    productsLoading.value = true
    productsError.value = null
    try {
      products.value = await request<Product[]>('/products')
    } catch (caught) {
      productsError.value = normalizeApiError(caught)
    } finally {
      productsLoading.value = false
    }
  }

  async function loadOrders() {
    loading.value = true
    error.value = null
    try {
      orders.value = await request<PurchaseOrder[]>('/inventory/purchases', {
        query: {
          grouped: '1',
          month: filters.month,
          status: filters.status,
          limit: 200
        }
      })
    } catch (caught) {
      error.value = normalizeApiError(caught)
    } finally {
      loading.value = false
    }
  }

  async function saveReceiptImage(file: File) {
    const image = await readFileAsBase64(file)
    receiptImage.value = {
      ...image,
      fileName: file.name
    }
    return receiptImage.value
  }

  async function createOrder(payload: PurchaseOrderPayload) {
    saving.value = true
    error.value = null
    try {
      const body = {
        ...payload,
        imageBase64: payload.imageBase64 || receiptImage.value?.imageBase64,
        mimeType: payload.mimeType || receiptImage.value?.mimeType
      }
      const saved = await request<PurchaseOrder, PurchaseOrderPayload>('/inventory/purchases', {
        method: 'POST',
        body
      })
      toastStore.show('进货单已创建，库存已入库', 'success')
      receiptImage.value = null
      aiCandidates.value = []
      await loadOrders()
      return saved
    } catch (caught) {
      error.value = normalizeApiError(caught)
      throw error.value
    } finally {
      saving.value = false
    }
  }

  async function voidOrder(order: PurchaseOrder) {
    voiding.value = true
    error.value = null
    try {
      await request<null>('/inventory/purchases', {
        method: 'DELETE',
        query: { id: order.id }
      })
      toastStore.show('进货单已作废，库存影响已回滚', 'success')
      await loadOrders()
    } catch (caught) {
      error.value = normalizeApiError(caught)
      throw error.value
    } finally {
      voiding.value = false
    }
  }

  async function recognizeReceipt() {
    if (!receiptImage.value) {
      aiError.value = {
        code: 'BAD_REQUEST',
        message: '请先上传进货截图'
      }
      return []
    }
    recognizing.value = true
    aiError.value = null
    try {
      const response = await request<{ text: string }, Record<string, unknown>>('/ai-proxy', {
        method: 'POST',
        body: {
          modelId: 'qwen3.5-omni-plus',
          imageBase64: receiptImage.value.imageBase64,
          mimeType: receiptImage.value.mimeType,
          maxTokens: 1600,
          systemPrompt: '你是进货截图识别助手。只返回 JSON，不要解释。',
          userPrompt: '从截图中识别进货商品明细，返回 {"items":[{"rawName":"商品名","quantity":数量,"unitPrice":单价,"totalPrice":小计}]}。AI 结果只用于人工确认，不能自动入账。'
        }
      })
      const parsed = extractJsonObject(response.text || '')
      aiCandidates.value = normalizeAiCandidates(parsed?.items || [], products.value)
      if (aiCandidates.value.length === 0) {
        aiError.value = {
          code: 'UNKNOWN_ERROR',
          message: 'AI 未识别出可确认的明细，请手动录入'
        }
      }
      return aiCandidates.value
    } catch (caught) {
      aiError.value = normalizeApiError(caught)
      return []
    } finally {
      recognizing.value = false
    }
  }

  function setAiCandidates(nextCandidates: PurchaseAiCandidate[]) {
    aiCandidates.value = nextCandidates
  }

  return {
    orders,
    filteredOrders,
    products,
    filters,
    summary,
    selectedOrder,
    aiCandidates,
    receiptImage,
    machineOptions,
    loading,
    productsLoading,
    saving,
    voiding,
    recognizing,
    error,
    productsError,
    aiError,
    updateFilters,
    loadProducts,
    loadOrders,
    saveReceiptImage,
    createOrder,
    voidOrder,
    recognizeReceipt,
    setAiCandidates
  }
}
