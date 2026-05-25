import type { ApiError } from '~/types/api'
import type { AiRecognitionImage, AiRecognitionPromptOptions } from '~/composables/useAiRecognition'
import type { Product } from '~/types/product'
import type {
  SalesAiCandidate,
  SalesItem,
  SalesListFilters,
  SalesOrder,
  SalesOrderPayload,
  SalesOrderType
} from '~/types/sale'
import { AI_PRODUCT_MATCHING_RULES, extractAiJsonObject, roundAiMoney, useAiRecognition } from '~/composables/useAiRecognition'
import { buildProductCatalogPrompt, matchProductByName, normalizeProductName } from '~/utils/product-match'

type SalesAiImage = AiRecognitionImage

const AI_RECOGNITION_MAX_TOKENS = 2200

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

function roundMoney(value: number) {
  return roundAiMoney(value)
}

function candidateRevenue(candidate: SalesAiCandidate) {
  const explicitRevenue = Math.abs(Number(candidate.itemRevenue) || 0)
  if (explicitRevenue > 0) return explicitRevenue
  return Math.abs(Number(candidate.sellPrice) || 0) * Math.abs(Number(candidate.quantity) || 0)
}

function mergeCandidateKey(candidate: SalesAiCandidate) {
  if (candidate.productId) return `product:${candidate.productId}`
  const fallbackName = candidate.rawName === '手动添加' ? '' : candidate.rawName
  const normalizedName = normalizeProductName(candidate.productName || fallbackName)
  return normalizedName ? `new:${normalizedName}` : candidate.id
}

function mergeAiCandidates(candidates: SalesAiCandidate[]) {
  const byKey = new Map<string, SalesAiCandidate>()
  for (const candidate of candidates) {
    const key = mergeCandidateKey(candidate)
    const existing = byKey.get(key)
    if (!existing) {
      const quantity = Math.abs(Number(candidate.quantity) || 0)
      const itemRevenue = roundMoney(candidateRevenue(candidate))
      byKey.set(key, {
        ...candidate,
        quantity,
        sellPrice: roundMoney(itemRevenue / Math.max(quantity, 1)),
        itemRevenue
      })
      continue
    }

    const quantity = Math.abs(Number(existing.quantity) || 0) + Math.abs(Number(candidate.quantity) || 0)
    const itemRevenue = roundMoney(candidateRevenue(existing) + candidateRevenue(candidate))
    const rawNames = new Set(existing.rawName.split(' / ').concat(candidate.rawName).filter(Boolean))
    byKey.set(key, {
      ...existing,
      rawName: Array.from(rawNames).join(' / '),
      quantity,
      sellPrice: roundMoney(itemRevenue / Math.max(quantity, 1)),
      itemRevenue,
      confidence: existing.confidence === 'high' && candidate.confidence === 'high' ? 'high' : 'medium',
      issue: existing.issue || candidate.issue
    })
  }
  return Array.from(byKey.values())
}

function normalizeAiCandidates(rawItems: Array<Record<string, unknown>>, products: readonly Product[]): SalesAiCandidate[] {
  const candidates = rawItems.map((item, index) => {
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
      sellPrice: roundMoney(sellPrice),
      itemRevenue: roundMoney(itemRevenue || sellPrice * quantity),
      issue: matchedProduct ? '' : '未匹配商品'
    }
  })
  return mergeAiCandidates(candidates)
}

function activeProducts(products: readonly Product[]) {
  return products.filter(product => product.status !== 'archived')
}

function buildSalesRecognitionPrompt(options: AiRecognitionPromptOptions & {
  catalog: string
}) {
  return [
    `从 ${options.totalImageCount} 张截图中识别销售商品明细，合并重复商品数量，返回 {"items":[{"rawName":"截图原文","productId":"匹配到的商品 id 或空字符串","productName":"匹配到的商品名","quantity":数量,"sellPrice":销售单价,"itemRevenue":小计}]}。`,
    '销售规则：quantity 是售出库存数量；sellPrice 是单个库存单位销售价；itemRevenue 是该行销售小计。金额单位是人民币元，只返回数字。',
    '只返回截图中真实存在的商品行；优惠、订单号、支付方式、合计行不是商品。',
    '同一批图片中如果出现多个同样商品，返回前先合并成一行：quantity 相加，itemRevenue 相加，sellPrice=itemRevenue/quantity。',
    ...AI_PRODUCT_MATCHING_RULES,
    '',
    options.catalog
  ].join('\n')
}

export function useSales() {
  const { request } = useApi()
  const aiRecognition = useAiRecognition()
  const toastStore = useToastStore()

  const orders = shallowRef<SalesOrder[]>([])
  const products = shallowRef<Product[]>([])
  const filters = reactive<SalesListFilters>({ ...defaultFilters })
  const selectedOrder = shallowRef<SalesOrder | null>(null)
  const aiCandidates = useState<SalesAiCandidate[]>('sales:ai-candidates', () => [])
  const salesImages = useState<SalesAiImage[]>('sales:ai-images', () => [])
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

  function groupItemsByMachine(items: SalesItem[]) {
    const groups = new Map<string, { machineId?: string; items: SalesItem[] }>()
    for (const item of items) {
      const product = products.value.find(entry => entry.id === item.productId)
      const machineId = product?.machineId || undefined
      const key = machineId || ''
      const group = groups.get(key) || { machineId, items: [] }
      group.items.push(item)
      groups.set(key, group)
    }
    return Array.from(groups.values())
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
    const images = await aiRecognition.readImageFiles(nextFiles)
    salesImages.value = [...salesImages.value, ...images]
    return salesImages.value
  }

  function removeSalesImage(id: string) {
    salesImages.value = salesImages.value.filter(image => image.id !== id)
  }

  function clearSalesImages() {
    salesImages.value = []
  }

  function clearSalesAiDraft() {
    clearSalesImages()
    aiCandidates.value = []
    aiError.value = null
    aiProgress.value = ''
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
      const endpoint = type === 'refund'
        ? '/inventory/refunds'
        : type === 'loss'
          ? '/inventory/losses'
          : '/inventory/sales'
      const baseBody = {
        ...payload,
        imageBase64: payload.imageBase64 || salesImage.value?.imageBase64,
        mimeType: payload.mimeType || salesImage.value?.mimeType
      }
      const itemGroups = payload.machineId
        ? [{ machineId: payload.machineId, items: validItems }]
        : groupItemsByMachine(validItems)
      const savedOrders: SalesOrder[] = []
      for (const group of itemGroups) {
        const saved = await request<SalesOrder, SalesOrderPayload>(endpoint, {
          method: 'POST',
          body: {
            ...baseBody,
            machineId: group.machineId,
            items: group.items
          }
        })
        savedOrders.push(saved)
      }
      const successMessage = type === 'refund'
        ? '退款单已创建，库存已回补'
        : type === 'loss'
          ? '损耗单已创建，库存已扣减'
          : itemGroups.length > 1
            ? `已按商品所属机器创建 ${itemGroups.length} 张销售单，库存已扣减`
            : '销售单已创建，库存已扣减'
      toastStore.show(successMessage, 'success')
      clearSalesAiDraft()
      await Promise.all([loadOrders(), loadProducts()])
      const firstSavedOrder = savedOrders[0]
      if (!firstSavedOrder) {
        const createError: ApiError = {
          code: 'UNKNOWN_ERROR',
          message: '销售单创建失败，请重试'
        }
        throw createError
      }
      return normalizeOrder(firstSavedOrder)
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
    aiProgress.value = `正在连接 AI，准备上传 ${salesImages.value.length} 张图片...`
    try {
      const catalog = buildProductCatalogPrompt(activeProducts(products.value))
      const recognizedCandidates: SalesAiCandidate[] = []
      const { warnings } = await aiRecognition.recognizeImageBatches<{ items?: Array<Record<string, unknown>> }>({
        images: salesImages.value,
        batchSize: salesImages.value.length,
        maxTokens: AI_RECOGNITION_MAX_TOKENS,
        systemPrompt: '你是销售截图识别助手。只返回合法 JSON，不要 Markdown，不要解释。',
        buildUserPrompt: (promptOptions: AiRecognitionPromptOptions) => buildSalesRecognitionPrompt({
          ...promptOptions,
          catalog
        }),
        parseResult: text => extractAiJsonObject<{ items?: Array<Record<string, unknown>> }>(text),
        onProgress: message => {
          aiProgress.value = message
        },
        onBatchResult: (parsed) => {
          const batchCandidates = normalizeAiCandidates(parsed.items || [], products.value)
          if (batchCandidates.length === 0) return false
          recognizedCandidates.push(...batchCandidates)
          aiCandidates.value = mergeAiCandidates(recognizedCandidates)
          return true
        }
      })
      aiCandidates.value = mergeAiCandidates(recognizedCandidates)
      if (aiCandidates.value.length === 0) {
        aiError.value = {
          code: 'UNKNOWN_ERROR',
          message: warnings.length > 0
            ? `AI 未识别出可确认的销售明细：${warnings.join('；')}。请手动录入`
            : 'AI 未识别出可确认的销售明细，请手动录入'
        }
      } else if (warnings.length > 0) {
        aiError.value = {
          code: 'UNKNOWN_ERROR',
          message: `部分图片未完成识别：${warnings.join('；')}。已保留可确认的明细，可手动补录缺失项`
        }
        aiProgress.value = `AI 已整理出 ${aiCandidates.value.length} 条明细，请检查未完成批次`
      } else {
        aiProgress.value = `AI 识别完成，已整理出 ${aiCandidates.value.length} 条明细`
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
    aiCandidates.value = mergeAiCandidates(nextCandidates)
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
    clearSalesAiDraft,
    createOrder,
    voidOrder,
    recognizeSalesScreenshot,
    setAiCandidates,
    validateInventory
  }
}
