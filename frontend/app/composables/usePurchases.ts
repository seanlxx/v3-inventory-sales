import type { ApiError } from '~/types/api'
import type { PurchaseAiCandidate, PurchaseAiMetadata, PurchaseListFilters, PurchaseOrder, PurchaseOrderPayload } from '~/types/purchase'
import type { Product } from '~/types/product'
import { buildProductCatalogPrompt, matchProductByName } from '~/utils/product-match'

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

type PurchaseAiRecognitionResult = PurchaseAiMetadata & {
  items?: Array<Record<string, unknown>>
}

function extractJsonObject(text: string) {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1)) as PurchaseAiRecognitionResult
  } catch {
    return null
  }
}

function normalizeAiDate(value: unknown) {
  const text = String(value || '').trim()
  if (!text) return ''
  const match = text
    .replace(/[./年]/g, '-')
    .replace(/月/g, '-')
    .replace(/日.*$/, '')
    .match(/(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (!match) return ''
  const year = match[1] || ''
  const month = match[2] || ''
  const day = match[3] || ''
  if (!year || !month || !day) return ''
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

function normalizeAiMetadata(parsed: PurchaseAiRecognitionResult | null): PurchaseAiMetadata | null {
  if (!parsed) return null
  const metadata: PurchaseAiMetadata = {
    date: normalizeAiDate(parsed.date),
    source: String(parsed.source || '').trim(),
    note: String(parsed.note || '').trim()
  }
  return metadata.date || metadata.source || metadata.note ? metadata : null
}

function moneyValue(...values: unknown[]) {
  for (const value of values) {
    const number = Number(value)
    if (Number.isFinite(number) && number > 0) return number
  }
  return 0
}

function roundMoney(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100
}

function normalizeAiCandidates(rawItems: Array<Record<string, unknown>>, products: readonly Product[]): PurchaseAiCandidate[] {
  return rawItems.map((item, index) => {
    const rawName = String(item.rawName || item.name || item.productName || '').trim()
    const aiProductId = String(item.productId || '').trim()

    let matchedProduct: Product | undefined = aiProductId
      ? products.find(product => product.id === aiProductId)
      : undefined
    let confidence: PurchaseAiCandidate['confidence'] = matchedProduct ? 'high' : 'low'

    if (!matchedProduct) {
      const candidateName = String(item.productName || rawName).trim()
      const result = matchProductByName(candidateName, products)
      if (result.product) {
        matchedProduct = result.product
        confidence = result.confidence
      }
    }

    const quantity = Math.max(1, Math.round(Number(item.quantity ?? item.qty) || 1))
    const totalPrice = moneyValue(item.totalPrice, item.amount, item.lineTotal, item.paidAmount)
    const unitPrice = moneyValue(item.unitPrice, item.price, item.costPrice) || (totalPrice > 0 ? totalPrice / quantity : 0)
    return {
      id: `ai-${index}-${rawName || 'item'}`,
      rawName: rawName || '未命名商品',
      productId: matchedProduct?.id || '',
      productName: matchedProduct?.name || rawName || '',
      confidence,
      quantity,
      unitPrice: roundMoney(unitPrice),
      totalPrice: roundMoney(totalPrice || unitPrice * quantity),
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
  const aiMetadata = shallowRef<PurchaseAiMetadata | null>(null)
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
    aiCandidates.value = []
    aiMetadata.value = null
    aiError.value = null
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
      aiMetadata.value = null
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
      const catalog = buildProductCatalogPrompt(products.value)
      const userPrompt = [
        '从截图中识别进货日期、来源和商品明细，返回 {"date":"YYYY-MM-DD 或空字符串","source":"拼多多/线下进货单/识别到的供应商","note":"关键依据简述","items":[{"rawName":"截图原文","productId":"匹配到的商品 id 或空字符串","productName":"匹配到的商品名","quantity":入库数量,"unitPrice":单个库存单位进货价,"totalPrice":该行实际进货总金额}]}。',
        '通用规则：quantity 是入库库存数量，不是订单件数；unitPrice 是单个库存单位进货价；totalPrice 是该行实际进货总金额。金额单位是人民币元，只返回数字。',
        '线下纸质进货单规则：优先读取表格右上方或表头的“下单时间”，date 取其日期；每行按条形码/货名/货号/件数/件价/换价/金额读取；若货号类似 1X12、1×24，件数为 N件，则 quantity=N*箱规后面的数量；unitPrice 优先用“换价/元”（如 3.25/瓶）；totalPrice 用“金额/元”。不要把底部合计当商品行。',
        '拼多多订单截图规则：source 返回“拼多多”；date 优先用“发货时间”，没有发货时间再用下单时间/拼单时间；真实进货总价优先取“自动确认收货并付款¥...”或“实付/应付款”里的实际付款金额，不能用商品标价、合计拼单价、优惠前金额；例如“自动确认收货并付款¥106.5”应作为 totalPrice。',
        '拼多多规格规则：如果规格或标题写“430g*24罐”“24罐”“x24”，购买数量 x1，则 quantity=24；若购买 x2，则 quantity=48；unitPrice=totalPrice/quantity。',
        '只返回截图中真实存在的商品行；优惠、运费、订单号、快递号不是商品。',
        '匹配规则：尽量在下面给出的商品清单中找最接近的一项，返回它的 productId；若清单中没有相似项，productId 留空字符串，rawName 保留截图原文。',
        '注意名称同义：如"毫升=ml"、"克=g"、"瓶装"可省略、"1L=1000ml"。',
        'AI 结果只用于人工确认，不能自动入账。',
        '',
        catalog
      ].join('\n')
      const response = await request<{ text: string }, Record<string, unknown>>('/ai-proxy', {
        method: 'POST',
        body: {
          imageBase64: receiptImage.value.imageBase64,
          mimeType: receiptImage.value.mimeType,
          maxTokens: 2200,
          systemPrompt: '你是进货截图识别助手。只返回合法 JSON，不要 Markdown，不要解释。日期格式必须是 YYYY-MM-DD，金额单位为人民币元。',
          userPrompt
        }
      })
      const parsed = extractJsonObject(response.text || '')
      aiMetadata.value = normalizeAiMetadata(parsed)
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
    aiMetadata,
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
