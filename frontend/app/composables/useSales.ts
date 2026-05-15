import type { ApiError } from '~/types/api'
import type { Product } from '~/types/product'
import type {
  SalesAiCandidate,
  SalesItem,
  SalesListFilters,
  SalesOrder,
  SalesOrderPayload,
  SalesOrderType
} from '~/types/sale'
import { buildProductCatalogPrompt, matchProductByName } from '~/utils/product-match'

type SalesAiImage = {
  id: string
  imageBase64: string
  mimeType: string
  fileName: string
  previewUrl: string
}

const defaultFilters: SalesListFilters = {
  month: new Date().toISOString().slice(0, 7),
  type: 'all',
  status: 'active',
  machineId: 'all',
  search: ''
}

function normalizeOrderType(value: unknown): SalesOrderType {
  if (value === 'refund') return 'refund'
  if (value === 'loss') return 'loss'
  return 'sale'
}

function normalizeOrder(order: SalesOrder): SalesOrder {
  const rawType = (order as { type?: unknown }).type
  return {
    ...order,
    type: normalizeOrderType(rawType === 'daily' ? 'sale' : rawType),
    status: order.status || (order.voidedAt ? 'voided' : 'active'),
    items: (order.items || []).map(item => ({
      ...item,
      quantity: Math.abs(Number(item.quantity) || 0),
      sellPrice: Math.abs(Number(item.sellPrice) || 0),
      itemRevenue: Math.abs(Number(item.itemRevenue) || 0),
      itemCogs: Math.abs(Number(item.itemCogs) || 0)
    }))
  }
}

function matchesSearch(order: SalesOrder, search: string) {
  const keyword = search.trim().toLowerCase()
  if (!keyword) return true
  const items = order.items.map(item => item.productName || item.productId).join(' ')
  return `${order.id} ${order.note || ''} ${order.machineId} ${items}`.toLowerCase().includes(keyword)
}

function readFileAsBase64(file: File) {
  return new Promise<{ imageBase64: string; mimeType: string; previewUrl: string }>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const value = String(reader.result || '')
      resolve({
        imageBase64: value.includes(',') ? value.split(',').pop() || '' : value,
        mimeType: file.type || 'image/jpeg',
        previewUrl: value
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

function streamError(message: string): ApiError {
  return {
    code: 'UNKNOWN_ERROR',
    message
  }
}

function normalizeAiCandidates(rawItems: Array<Record<string, unknown>>, products: readonly Product[]): SalesAiCandidate[] {
  return rawItems.map((item, index) => {
    const rawName = String(item.rawName || item.name || item.productName || '').trim()
    const aiProductId = String(item.productId || '').trim()

    // 1. 优先用 AI 直接给出的 productId（前提是真的存在于本地清单）
    let matchedProduct: Product | undefined = aiProductId
      ? products.find(product => product.id === aiProductId)
      : undefined
    let confidence: SalesAiCandidate['confidence'] = matchedProduct ? 'high' : 'low'

    // 2. 兜底：本地归一化 + 评分匹配
    if (!matchedProduct) {
      const candidateName = String(item.productName || rawName).trim()
      const result = matchProductByName(candidateName, products)
      if (result.product) {
        matchedProduct = result.product
        confidence = result.confidence
      }
    }

    const quantity = Math.max(1, Number(item.quantity) || 1)
    const itemRevenue = Math.max(0, Number(item.itemRevenue) || Number(item.totalPrice) || 0)
    const sellPrice = Math.max(
      0,
      Number(item.sellPrice) || Number(item.unitPrice)
        || (itemRevenue > 0 ? itemRevenue / quantity : matchedProduct?.sellPrice || 0)
    )
    return {
      id: `ai-${index}-${rawName || 'item'}`,
      rawName: rawName || '未命名商品',
      productId: matchedProduct?.id || '',
      productName: matchedProduct?.name || rawName || '',
      confidence,
      quantity,
      sellPrice,
      itemRevenue: itemRevenue || sellPrice * quantity,
      issue: matchedProduct ? '' : '未匹配商品'
    }
  })
}

function activeProducts(products: readonly Product[]) {
  return products.filter(product => product.status !== 'archived')
}

export function useSales() {
  const { request } = useApi()
  const config = useRuntimeConfig()
  const toastStore = useToastStore()

  const orders = shallowRef<SalesOrder[]>([])
  const products = shallowRef<Product[]>([])
  const filters = reactive<SalesListFilters>({ ...defaultFilters })
  const selectedOrder = shallowRef<SalesOrder | null>(null)
  const aiCandidates = shallowRef<SalesAiCandidate[]>([])
  const salesImages = shallowRef<SalesAiImage[]>([])
  const salesImage = computed(() => salesImages.value[0] || null)
  const loading = shallowRef(false)
  const productsLoading = shallowRef(false)
  const saving = shallowRef(false)
  const voiding = shallowRef(false)
  const recognizing = shallowRef(false)
  const aiProgress = shallowRef('')
  const error = shallowRef<ApiError | null>(null)
  const productsError = shallowRef<ApiError | null>(null)
  const aiError = shallowRef<ApiError | null>(null)

  const filteredOrders = computed(() =>
    orders.value.filter(order => matchesSearch(order, filters.search))
  )

  const summary = computed(() =>
    filteredOrders.value.reduce((result, order) => {
      if (order.status === 'voided') return result
      result.count += 1
      result.quantity += order.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
      if (order.type === 'sale') result.salesAmount += Number(order.totalAmount) || 0
      if (order.type === 'refund') result.refundAmount += Number(order.totalAmount) || 0
      if (order.type === 'loss') result.lossQuantity += order.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
      return result
    }, { count: 0, quantity: 0, salesAmount: 0, refundAmount: 0, lossQuantity: 0 })
  )

  const productOptions = computed(() => activeProducts(products.value))

  const machineOptions = computed(() => {
    const machines = new Set(products.value.map(product => product.machineId).filter(Boolean))
    if (machines.size === 0) {
      machines.add('1号机')
      machines.add('2号机')
    }
    return Array.from(machines).sort((left, right) => left.localeCompare(right, 'zh-CN'))
  })

  function updateFilters(nextFilters: Partial<SalesListFilters>) {
    Object.assign(filters, nextFilters)
  }

  function validateInventory(type: SalesOrderType, items: SalesItem[]) {
    if (type === 'refund') return null
    for (const item of items) {
      const product = products.value.find(entry => entry.id === item.productId)
      const available = Number(product?.currentStock) || 0
      const quantity = Number(item.quantity) || 0
      if (quantity > available) {
        return `${product?.name || item.productName || item.productId} 库存不足：当前 ${available}，本次 ${quantity}`
      }
    }
    return null
  }

  async function loadProducts() {
    productsLoading.value = true
    productsError.value = null
    try {
      products.value = await request<Product[]>('/products', {
        query: { includeArchived: '1' }
      })
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
      const response = await request<SalesOrder[]>('/inventory/sales', {
        query: {
          yearMonth: filters.month,
          type: filters.type,
          status: filters.status,
          machineId: filters.machineId,
          limit: 200
        }
      })
      orders.value = response.map(normalizeOrder)
    } catch (caught) {
      error.value = normalizeApiError(caught)
    } finally {
      loading.value = false
    }
  }

  async function saveSalesImages(files: File[] | File) {
    const nextFiles = Array.isArray(files) ? files : [files]
    const images = await Promise.all(nextFiles.map(async (file, index) => {
      const image = await readFileAsBase64(file)
      return {
        ...image,
        id: `${Date.now()}-${index}-${file.name}`,
        fileName: file.name
      }
    }))
    salesImages.value = [...salesImages.value, ...images]
    return salesImages.value
  }

  function removeSalesImage(id: string) {
    salesImages.value = salesImages.value.filter(image => image.id !== id)
  }

  function clearSalesImages() {
    salesImages.value = []
  }

  async function requestAiStream(body: Record<string, unknown>, onDelta: (text: string) => void) {
    const authStore = useAuthStore()
    authStore.initialize()
    const apiBase = String(config.public.apiBase || '/api').replace(/\/$/, '')
    const response = await fetch(`${apiBase}/ai-proxy?stream=1`, {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
        ...(authStore.token ? { 'X-VM-Session': authStore.token } : {})
      },
      body: JSON.stringify(body)
    })

    if (!response.ok || !response.body) {
      const data = await response.json().catch(() => null) as { error?: string; message?: string } | null
      throw streamError(data?.message || data?.error || `AI 请求失败：${response.status}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffered = ''
    let finalText = ''

    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffered += decoder.decode(value, { stream: true })

      let index = buffered.indexOf('\n\n')
      while (index !== -1) {
        const rawEvent = buffered.slice(0, index)
        buffered = buffered.slice(index + 2)
        const lines = rawEvent.split('\n')
        const event = lines.find(line => line.startsWith('event:'))?.slice(6).trim() || 'message'
        const dataLine = lines.find(line => line.startsWith('data:'))
        if (dataLine) {
          const data = JSON.parse(dataLine.slice(5).trim()) as { text?: string; error?: string }
          if (event === 'delta' && data.text) {
            onDelta(data.text)
          } else if (event === 'done') {
            finalText = data.text || finalText
          } else if (event === 'error') {
            throw streamError(data.error || 'AI 流式识别失败')
          }
        }
        index = buffered.indexOf('\n\n')
      }
    }

    return finalText
  }

  async function createOrder(type: SalesOrderType, payload: SalesOrderPayload) {
    const validItems = payload.items.map(item => ({
      ...item,
      quantity: Math.abs(Number(item.quantity) || 0),
      sellPrice: Math.abs(Number(item.sellPrice) || 0),
      itemRevenue: Math.abs(Number(item.itemRevenue) || 0)
    })).filter(item => item.productId && item.quantity > 0)
    const inventoryError = validateInventory(type, validItems)
    if (inventoryError) {
      const validationError: ApiError = {
        code: 'BAD_REQUEST',
        message: inventoryError
      }
      error.value = validationError
      toastStore.show(validationError.message, 'danger')
      throw validationError
    }

    saving.value = true
    error.value = null
    try {
      const body = {
        ...payload,
        items: validItems,
        imageBase64: payload.imageBase64 || salesImage.value?.imageBase64,
        mimeType: payload.mimeType || salesImage.value?.mimeType
      }
      const endpoint = type === 'refund'
        ? '/inventory/refunds'
        : type === 'loss'
          ? '/inventory/losses'
          : '/inventory/sales'
      const saved = await request<SalesOrder, SalesOrderPayload>(endpoint, {
        method: 'POST',
        body
      })
      toastStore.show(type === 'refund' ? '退款单已创建，库存已回补' : type === 'loss' ? '损耗单已创建，库存已扣减' : '销售单已创建，库存已扣减', 'success')
      clearSalesImages()
      aiCandidates.value = []
      await Promise.all([loadOrders(), loadProducts()])
      return normalizeOrder(saved)
    } catch (caught) {
      error.value = normalizeApiError(caught)
      throw error.value
    } finally {
      saving.value = false
    }
  }

  async function voidOrder(order: SalesOrder) {
    voiding.value = true
    error.value = null
    try {
      await request<null>('/inventory/sales', {
        method: 'DELETE',
        query: { id: order.id }
      })
      toastStore.show('单据已作废，库存影响已回滚', 'success')
      await Promise.all([loadOrders(), loadProducts()])
    } catch (caught) {
      error.value = normalizeApiError(caught)
      throw error.value
    } finally {
      voiding.value = false
    }
  }

  async function recognizeSalesScreenshot() {
    if (salesImages.value.length === 0) {
      aiError.value = {
        code: 'BAD_REQUEST',
        message: '请先上传销售截图'
      }
      return []
    }
    recognizing.value = true
    aiError.value = null
    aiProgress.value = '正在连接 AI，准备上传图片...'
    try {
      const catalog = buildProductCatalogPrompt(activeProducts(products.value))
      const userPrompt = [
        `从 ${salesImages.value.length} 张截图中识别销售商品明细，合并重复商品数量，返回 {"items":[{"rawName":"截图原文","productId":"匹配到的商品 id 或空字符串","productName":"匹配到的商品名","quantity":数量,"sellPrice":销售单价,"itemRevenue":小计}]}。`,
        '匹配规则：尽量在下面给出的商品清单中找最接近的一项，返回它的 productId；若清单中没有相似项，productId 留空字符串，rawName 保留截图原文。',
        '注意名称同义：如"毫升=ml"、"克=g"、"瓶装"可省略、"1L=1000ml"。',
        'AI 结果只用于人工确认，不能自动入账。',
        '',
        catalog
      ].join('\n')
      let receivedLength = 0
      const text = await requestAiStream({
        images: salesImages.value.map(image => ({
          imageBase64: image.imageBase64,
          mimeType: image.mimeType
        })),
        maxTokens: 2200,
        stream: true,
        systemPrompt: '你是销售截图识别助手。只返回 JSON，不要解释。',
        userPrompt
      }, (delta) => {
        receivedLength += delta.length
        aiProgress.value = `AI 正在识别，已接收 ${receivedLength} 个字符...`
      })
      aiProgress.value = 'AI 识别完成，正在整理结果...'
      const parsed = extractJsonObject(text || '')
      aiCandidates.value = normalizeAiCandidates(parsed?.items || [], products.value)
      if (aiCandidates.value.length === 0) {
        aiError.value = {
          code: 'UNKNOWN_ERROR',
          message: 'AI 未识别出可确认的销售明细，请手动录入'
        }
      }
      return aiCandidates.value
    } catch (caught) {
      aiError.value = normalizeApiError(caught)
      return []
    } finally {
      recognizing.value = false
      if (!aiError.value) aiProgress.value = ''
    }
  }

  function setAiCandidates(nextCandidates: SalesAiCandidate[]) {
    aiCandidates.value = nextCandidates
  }

  return {
    orders,
    filteredOrders,
    products,
    productOptions,
    filters,
    summary,
    selectedOrder,
    aiCandidates,
    salesImages,
    salesImage,
    machineOptions,
    loading,
    productsLoading,
    saving,
    voiding,
    recognizing,
    aiProgress,
    error,
    productsError,
    aiError,
    updateFilters,
    loadProducts,
    loadOrders,
    saveSalesImage: saveSalesImages,
    saveSalesImages,
    removeSalesImage,
    createOrder,
    voidOrder,
    recognizeSalesScreenshot,
    setAiCandidates,
    validateInventory
  }
}
