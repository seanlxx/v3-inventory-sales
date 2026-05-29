import type { ApiError } from '~/types/api'
import type { AiRecognitionImage, AiRecognitionPromptOptions } from '~/composables/useAiRecognition'
import type { PurchaseAiCandidate, PurchaseAiMetadata, PurchaseListFilters, PurchaseOrder, PurchaseOrderPayload } from '~/types/purchase'
import type { Product } from '~/types/product'
import { AI_PRODUCT_MATCHING_RULES, extractAiJsonObject, roundAiMoney, useAiRecognition } from '~/composables/useAiRecognition'
import { buildProductCatalogPrompt, matchProductByName, normalizeProductName } from '~/utils/product-match'

type PurchaseAiImage = AiRecognitionImage

const AI_RECOGNITION_MAX_TOKENS = 3200

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

type PurchaseAiRecognitionResult = PurchaseAiMetadata & {
  items?: Array<Record<string, unknown>>
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

function mergeAiMetadata(current: PurchaseAiMetadata | null, next: PurchaseAiMetadata | null): PurchaseAiMetadata | null {
  if (!next) return current
  if (!current) return next
  const notes = [current.note, next.note].filter(Boolean)
  return {
    date: current.date || next.date,
    source: current.source || next.source,
    note: Array.from(new Set(notes)).join('；').slice(0, 240)
  }
}

function moneyValue(...values: unknown[]) {
  for (const value of values) {
    const number = Number(value)
    if (Number.isFinite(number) && number > 0) return number
  }
  return 0
}

function roundMoney(value: number) {
  return roundAiMoney(value)
}

function candidateSortKey(candidate: PurchaseAiCandidate) {
  const fallbackName = candidate.rawName === '手动添加' ? '' : candidate.rawName
  const normalizedName = normalizeProductName(candidate.productName || fallbackName)
  if (candidate.productId) return `0:${normalizedName || candidate.productId}:${candidate.productId}`
  if (normalizedName) return `1:${normalizedName}`
  return '2:manual'
}

function sortAiCandidates(candidates: PurchaseAiCandidate[]) {
  return candidates
    .map((candidate, index) => ({
      candidate,
      index,
      sortKey: candidateSortKey(candidate)
    }))
    .sort((left, right) =>
      left.sortKey.localeCompare(right.sortKey, 'zh-CN', { numeric: true }) || left.index - right.index
    )
    .map(item => item.candidate)
}

// 折叠值（zn 销售导入历史遗留）。AI 识别进货时不应把这些商品发给 AI 做匹配，
// 否则容易被选中导致串货（见 docs/重构计划-1-2号机.md R-D 根因）。
const FOLDED_MACHINE_IDS = new Set(['1/2号机', '1/2号机总库存'])

function activeProducts(products: readonly Product[]) {
  return products.filter(product =>
    product.status !== 'archived'
    && !FOLDED_MACHINE_IDS.has(product.machineId || '')
  )
}

function buildPurchaseRecognitionPrompt(options: {
  totalImageCount: number
  batchImageCount: number
  batchIndex: number
  batchCount: number
  catalog: string
}) {
  const batchLabel = options.batchCount > 1
    ? `这是第 ${options.batchIndex + 1}/${options.batchCount} 批，本批 ${options.batchImageCount} 张，共 ${options.totalImageCount} 张。只识别本批图片中真实存在的商品行，最终系统会把同商品排列在一起供人工核对。`
    : `从 ${options.totalImageCount} 张截图中识别进货日期、来源和商品明细。`
  return [
    `${batchLabel}返回 {"date":"YYYY-MM-DD 或空字符串","source":"拼多多/线下进货单/识别到的供应商","note":"关键依据简述","items":[{"rawName":"截图原文","productId":"匹配到的商品 id 或空字符串","productName":"匹配到的商品名","quantity":入库数量,"unitPrice":单个库存单位进货价,"totalPrice":该行实际进货总金额,"sellPrice":新商品建议售价或 0}]}。`,
    '通用规则：quantity 是入库库存数量，不是订单件数；unitPrice 是单个库存单位进货价；totalPrice 是该行实际进货总金额。金额单位是人民币元，只返回数字。',
    '线下纸质进货单规则：优先读取表格右上方或表头的“下单时间”，date 取其日期；每行按条形码/货名/货号/件数/件价/换价/金额读取；若货号类似 1X12、1×24，件数为 N件，则 quantity=N*箱规后面的数量；unitPrice 优先用“换价/元”（如 3.25/瓶）；totalPrice 用“金额/元”。不要把底部合计当商品行。',
    '拼多多订单截图规则：source 返回“拼多多”；date 优先用“发货时间”，没有发货时间再用下单时间/拼单时间；真实进货总价优先取“自动确认收货并付款¥...”或“实付/应付款”里的实际付款金额，不能用商品标价、合计拼单价、优惠前金额；例如“自动确认收货并付款¥106.5”应作为 totalPrice。',
    '拼多多规格规则：如果规格或标题写“430g*24罐”“24罐”“x24”，购买数量 x1，则 quantity=24；若购买 x2，则 quantity=48；unitPrice=totalPrice/quantity。',
    '只返回截图中真实存在的商品行；优惠、运费、订单号、快递号不是商品。',
    '同一个批次中如果出现多个同样商品，不要合并；按截图原始明细逐行返回，系统会把同商品排列在一起供人工核对。',
    '如果识别到商品但库内没有同样商品，productId 必须留空，productName 返回可创建的新商品名称，sellPrice 不确定时返回 0，后续由人工填写售价。',
    ...AI_PRODUCT_MATCHING_RULES,
    '',
    options.catalog
  ].join('\n')
}

function prefixBatchCandidateIds(candidates: PurchaseAiCandidate[], batchIndex: number) {
  return candidates.map(candidate => ({
    ...candidate,
    id: `ai-b${batchIndex + 1}-${candidate.id}`
  }))
}

function normalizeAiCandidates(rawItems: Array<Record<string, unknown>>, products: readonly Product[]): PurchaseAiCandidate[] {
  const candidates = rawItems.map((item, index) => {
    const rawName = String(item.rawName || item.name || item.productName || '').trim()
    const aiProductId = String(item.productId || '').trim()

    let matchedProduct: Product | undefined = aiProductId
      ? products.find(product => product.id === aiProductId)
      : undefined
    let confidence: PurchaseAiCandidate['confidence'] = matchedProduct ? 'high' : 'low'
    const candidateName = String(item.productName || rawName).trim()

    if (!matchedProduct) {
      const result = matchProductByName(candidateName, products)
      if (result.product) {
        matchedProduct = result.product
        confidence = result.confidence
      }
    }

    const quantity = Math.max(1, Math.round(Number(item.quantity ?? item.qty) || 0))
    const rawQuantityNumber = Number(item.quantity ?? item.qty)
    const quantitySuspect = Number.isFinite(rawQuantityNumber) && rawQuantityNumber <= 0
    const totalPrice = moneyValue(item.totalPrice, item.amount, item.lineTotal, item.paidAmount)
    const unitPrice = moneyValue(item.unitPrice, item.price, item.costPrice) || (totalPrice > 0 ? totalPrice / quantity : 0)
    const sellPrice = moneyValue(item.sellPrice, item.salePrice, item.retailPrice)
    const isNewProduct = !matchedProduct
    return {
      id: `ai-${index}-${rawName || 'item'}`,
      rawName: rawName || '未命名商品',
      productId: matchedProduct?.id || '',
      productName: matchedProduct?.name || candidateName || rawName || '',
      confidence,
      quantity,
      unitPrice: roundMoney(unitPrice),
      totalPrice: roundMoney(totalPrice || unitPrice * quantity),
      sellPrice: matchedProduct ? matchedProduct.sellPrice : roundMoney(sellPrice),
      category: isNewProduct ? '其他' : undefined,
      machineId: matchedProduct?.machineId,
      isNewProduct,
      issue: quantitySuspect
        ? 'AI 数量不可信，请人工确认'
        : matchedProduct ? '' : '新商品，需填写售价'
    }
  })
  return sortAiCandidates(candidates)
}

export function usePurchases() {
  const { request } = useApi()
  const aiRecognition = useAiRecognition()
  const toastStore = useToastStore()

  const orders = shallowRef<PurchaseOrder[]>([])
  const products = shallowRef<Product[]>([])
  const filters = reactive<PurchaseListFilters>({ ...defaultFilters })
  const selectedOrder = shallowRef<PurchaseOrder | null>(null)
  const aiCandidates = shallowRef<PurchaseAiCandidate[]>([])
  const aiMetadata = shallowRef<PurchaseAiMetadata | null>(null)
  const purchaseImages = shallowRef<PurchaseAiImage[]>([])
  const receiptImage = computed(() => purchaseImages.value[0] || null)
  const loading = shallowRef(false)
  const productsLoading = shallowRef(false)
  const saving = shallowRef(false)
  const voiding = shallowRef(false)
  const recognizing = shallowRef(false)
  const aiProgress = shallowRef('')
  const error = shallowRef<ApiError | null>(null)
  const productsError = shallowRef<ApiError | null>(null)
  const aiError = shallowRef<ApiError | null>(null)
  let aiAbortController: AbortController | null = null

  function abortRecognition() {
    if (aiAbortController) {
      aiAbortController.abort()
      aiAbortController = null
    }
  }

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

  async function saveReceiptImage(files: File[] | File) {
    const nextFiles = Array.isArray(files) ? files : [files]
    if (nextFiles.length === 0) return purchaseImages.value
    const images = await aiRecognition.readImageFiles(nextFiles)
    purchaseImages.value = [...purchaseImages.value, ...images]
    aiCandidates.value = []
    aiMetadata.value = null
    aiError.value = null
    aiProgress.value = ''
    return purchaseImages.value
  }

  function removeReceiptImage(id: string) {
    const target = purchaseImages.value.find(image => image.id === id)
    if (target) aiRecognition.releaseImagePreview(target)
    purchaseImages.value = purchaseImages.value.filter(image => image.id !== id)
    aiCandidates.value = []
    aiMetadata.value = null
    aiError.value = null
    aiProgress.value = ''
  }

  function clearReceiptImages() {
    abortRecognition()
    for (const image of purchaseImages.value) aiRecognition.releaseImagePreview(image)
    purchaseImages.value = []
    aiCandidates.value = []
    aiMetadata.value = null
    aiError.value = null
    aiProgress.value = ''
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
      for (const image of purchaseImages.value) aiRecognition.releaseImagePreview(image)
      purchaseImages.value = []
      aiCandidates.value = []
      aiMetadata.value = null
      aiProgress.value = ''
      await Promise.all([loadOrders(), loadProducts()])
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
    if (purchaseImages.value.length === 0) {
      aiError.value = {
        code: 'BAD_REQUEST',
        message: '请先上传进货截图'
      }
      return []
    }
    recognizing.value = true
    aiError.value = null
    aiProgress.value = `正在连接 AI，准备上传 ${purchaseImages.value.length} 张图片...`
    aiAbortController?.abort()
    aiAbortController = new AbortController()
    const controller = aiAbortController
    try {
      const matchableProducts = activeProducts(products.value)
      const catalog = buildProductCatalogPrompt(matchableProducts)
      const recognizedCandidates: PurchaseAiCandidate[] = []
      let recognizedMetadata: PurchaseAiMetadata | null = null

      const { warnings } = await aiRecognition.recognizeImageBatches<PurchaseAiRecognitionResult>({
        images: purchaseImages.value,
        maxTokens: AI_RECOGNITION_MAX_TOKENS,
        signal: controller.signal,
        systemPrompt: '你是进货截图识别助手。只返回合法 JSON，不要 Markdown，不要解释。日期格式必须是 YYYY-MM-DD，金额单位为人民币元。',
        buildUserPrompt: (promptOptions: AiRecognitionPromptOptions) => buildPurchaseRecognitionPrompt({
          ...promptOptions,
          catalog
        }),
        parseResult: text => extractAiJsonObject<PurchaseAiRecognitionResult>(text),
        onProgress: message => {
          aiProgress.value = message
        },
        onBatchResult: (parsed, batchIndex) => {
          recognizedMetadata = mergeAiMetadata(recognizedMetadata, normalizeAiMetadata(parsed))
          const batchCandidates = prefixBatchCandidateIds(
            normalizeAiCandidates(parsed.items || [], matchableProducts),
            batchIndex
          )
          if (batchCandidates.length === 0) return false

          recognizedCandidates.push(...batchCandidates)
          aiMetadata.value = recognizedMetadata
          aiCandidates.value = sortAiCandidates(recognizedCandidates)
          return true
        }
      })

      aiMetadata.value = recognizedMetadata
      aiCandidates.value = sortAiCandidates(recognizedCandidates)
      if (aiCandidates.value.length === 0) {
        aiError.value = {
          code: 'UNKNOWN_ERROR',
          message: warnings.length > 0
            ? `AI 未识别出可确认的明细：${warnings.join('；')}。请手动录入`
            : 'AI 未识别出可确认的明细，请手动录入'
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
      if (aiAbortController === controller) aiAbortController = null
      if (!aiError.value) aiProgress.value = ''
    }
  }

  function setAiCandidates(nextCandidates: PurchaseAiCandidate[]) {
    aiCandidates.value = sortAiCandidates(nextCandidates)
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
    purchaseImages,
    receiptImage,
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
    saveReceiptImage,
    removeReceiptImage,
    clearReceiptImages,
    createOrder,
    voidOrder,
    recognizeReceipt,
    setAiCandidates
  }
}
