import type { ApiError } from '~/types/api'
import type { PurchaseAiCandidate, PurchaseAiMetadata, PurchaseListFilters, PurchaseOrder, PurchaseOrderPayload } from '~/types/purchase'
import type { Product } from '~/types/product'
import { buildProductCatalogPrompt, matchProductByName, normalizeProductName } from '~/utils/product-match'

type PurchaseAiImage = {
  id: string
  imageBase64: string
  mimeType: string
  aiImageBase64: string
  aiMimeType: string
  fileName: string
  previewUrl: string
}

const AI_IMAGE_BATCH_SIZE = 4
const AI_IMAGE_MAX_EDGE = 1600
const AI_IMAGE_MAX_ORIGINAL_BYTES = 900 * 1024
const AI_IMAGE_JPEG_QUALITY = 0.84
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

function splitDataUrl(dataUrl: string, fallbackMimeType: string) {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.*)$/)
  return {
    imageBase64: match?.[2] || (dataUrl.includes(',') ? dataUrl.split(',').pop() || '' : dataUrl),
    mimeType: match?.[1] || fallbackMimeType || 'image/jpeg'
  }
}

function readBlobAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      resolve(String(reader.result || ''))
    }
    reader.onerror = () => reject(reader.error || new Error('读取图片失败'))
    reader.readAsDataURL(blob)
  })
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片解码失败'))
    image.src = dataUrl
  })
}

function canvasToJpegDataUrl(canvas: HTMLCanvasElement) {
  return new Promise<string | null>((resolve) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        resolve(null)
        return
      }
      resolve(await readBlobAsDataUrl(blob))
    }, 'image/jpeg', AI_IMAGE_JPEG_QUALITY)
  })
}

async function optimizeImageForAi(file: File, originalDataUrl: string) {
  try {
    const image = await loadImage(originalDataUrl)
    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height
    if (!width || !height) return originalDataUrl

    const scale = Math.min(1, AI_IMAGE_MAX_EDGE / Math.max(width, height))
    if (scale >= 1 && file.size <= AI_IMAGE_MAX_ORIGINAL_BYTES) return originalDataUrl

    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))

    const context = canvas.getContext('2d')
    if (!context) return originalDataUrl

    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)

    const optimizedDataUrl = await canvasToJpegDataUrl(canvas)
    if (!optimizedDataUrl) return originalDataUrl
    return optimizedDataUrl.length < originalDataUrl.length || scale < 1 ? optimizedDataUrl : originalDataUrl
  } catch {
    return originalDataUrl
  }
}

async function readFileAsBase64(file: File) {
  const originalDataUrl = await readBlobAsDataUrl(file)
  const optimizedDataUrl = await optimizeImageForAi(file, originalDataUrl)
  const originalImage = splitDataUrl(originalDataUrl, file.type || 'image/jpeg')
  const aiImage = splitDataUrl(optimizedDataUrl, file.type || 'image/jpeg')
  return {
    imageBase64: originalImage.imageBase64,
    mimeType: originalImage.mimeType,
    aiImageBase64: aiImage.imageBase64,
    aiMimeType: aiImage.mimeType,
    previewUrl: originalDataUrl
  }
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

function chunkList<T>(items: readonly T[], size: number) {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
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
  return Math.round((Number(value) || 0) * 100) / 100
}

function streamError(message: string): ApiError {
  return {
    code: 'UNKNOWN_ERROR',
    message
  }
}

function mergeCandidateKey(candidate: PurchaseAiCandidate) {
  if (candidate.productId) return `product:${candidate.productId}`
  const fallbackName = candidate.rawName === '手动添加' ? '' : candidate.rawName
  const normalizedName = normalizeProductName(candidate.productName || fallbackName)
  return normalizedName ? `new:${normalizedName}` : candidate.id
}

function mergeAiCandidates(candidates: PurchaseAiCandidate[]) {
  const byKey = new Map<string, PurchaseAiCandidate>()
  for (const candidate of candidates) {
    const key = mergeCandidateKey(candidate)
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, { ...candidate })
      continue
    }

    const quantity = existing.quantity + candidate.quantity
    const totalPrice = roundMoney(existing.totalPrice + candidate.totalPrice)
    const rawNames = new Set(existing.rawName.split(' / ').concat(candidate.rawName).filter(Boolean))
    byKey.set(key, {
      ...existing,
      rawName: Array.from(rawNames).join(' / '),
      quantity,
      unitPrice: roundMoney(totalPrice / Math.max(quantity, 1)),
      totalPrice,
      confidence: existing.confidence === 'high' && candidate.confidence === 'high' ? 'high' : 'medium',
      issue: existing.issue || candidate.issue
    })
  }
  return Array.from(byKey.values())
}

function buildPurchaseRecognitionPrompt(options: {
  totalImageCount: number
  batchImageCount: number
  batchIndex: number
  batchCount: number
  catalog: string
}) {
  const batchLabel = options.batchCount > 1
    ? `这是第 ${options.batchIndex + 1}/${options.batchCount} 批，本批 ${options.batchImageCount} 张，共 ${options.totalImageCount} 张。只识别本批图片中真实存在的商品行，最终系统会自动合并各批结果。`
    : `从 ${options.totalImageCount} 张截图中识别进货日期、来源和商品明细。`
  return [
    `${batchLabel}返回 {"date":"YYYY-MM-DD 或空字符串","source":"拼多多/线下进货单/识别到的供应商","note":"关键依据简述","items":[{"rawName":"截图原文","productId":"匹配到的商品 id 或空字符串","productName":"匹配到的商品名","quantity":入库数量,"unitPrice":单个库存单位进货价,"totalPrice":该行实际进货总金额,"sellPrice":新商品建议售价或 0}]}。`,
    '通用规则：quantity 是入库库存数量，不是订单件数；unitPrice 是单个库存单位进货价；totalPrice 是该行实际进货总金额。金额单位是人民币元，只返回数字。',
    '线下纸质进货单规则：优先读取表格右上方或表头的“下单时间”，date 取其日期；每行按条形码/货名/货号/件数/件价/换价/金额读取；若货号类似 1X12、1×24，件数为 N件，则 quantity=N*箱规后面的数量；unitPrice 优先用“换价/元”（如 3.25/瓶）；totalPrice 用“金额/元”。不要把底部合计当商品行。',
    '拼多多订单截图规则：source 返回“拼多多”；date 优先用“发货时间”，没有发货时间再用下单时间/拼单时间；真实进货总价优先取“自动确认收货并付款¥...”或“实付/应付款”里的实际付款金额，不能用商品标价、合计拼单价、优惠前金额；例如“自动确认收货并付款¥106.5”应作为 totalPrice。',
    '拼多多规格规则：如果规格或标题写“430g*24罐”“24罐”“x24”，购买数量 x1，则 quantity=24；若购买 x2，则 quantity=48；unitPrice=totalPrice/quantity。',
    '只返回截图中真实存在的商品行；优惠、运费、订单号、快递号不是商品。',
    '同一个批次中如果出现多个同样商品，返回前先合并成一行：quantity 相加，totalPrice 相加，unitPrice=totalPrice/quantity。',
    '匹配规则：尽量在下面给出的商品清单中找最接近的一项，返回它的 productId；若清单中没有相似项，productId 留空字符串，rawName 保留截图原文。',
    '如果识别到商品但库内没有同样商品，productId 必须留空，productName 返回可创建的新商品名称，sellPrice 不确定时返回 0，后续由人工填写售价。',
    '注意名称同义：如"毫升=ml"、"克=g"、"瓶装"可省略、"1L=1000ml"。',
    'AI 结果只用于人工确认，不能自动入账。',
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

    const quantity = Math.max(1, Math.round(Number(item.quantity ?? item.qty) || 1))
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
      issue: matchedProduct ? '' : '新商品，需填写售价'
    }
  })
  return mergeAiCandidates(candidates)
}

export function usePurchases() {
  const { request } = useApi()
  const config = useRuntimeConfig()
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
    const images = await Promise.all(nextFiles.map(async (file, index) => {
      const image = await readFileAsBase64(file)
      return {
        ...image,
        id: `${Date.now()}-${index}-${file.name}`,
        fileName: file.name
      }
    }))
    purchaseImages.value = [...purchaseImages.value, ...images]
    aiCandidates.value = []
    aiMetadata.value = null
    aiError.value = null
    aiProgress.value = ''
    return purchaseImages.value
  }

  function removeReceiptImage(id: string) {
    purchaseImages.value = purchaseImages.value.filter(image => image.id !== id)
    aiCandidates.value = []
    aiMetadata.value = null
    aiError.value = null
    aiProgress.value = ''
  }

  function clearReceiptImages() {
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
    try {
      const catalog = buildProductCatalogPrompt(products.value)
      const imageBatches = chunkList(purchaseImages.value, AI_IMAGE_BATCH_SIZE)
      const recognizedCandidates: PurchaseAiCandidate[] = []
      const warnings: string[] = []
      let recognizedMetadata: PurchaseAiMetadata | null = null

      for (let batchIndex = 0; batchIndex < imageBatches.length; batchIndex += 1) {
        const batch = imageBatches[batchIndex] || []
        let receivedLength = 0
        const batchLabel = `第 ${batchIndex + 1}/${imageBatches.length} 批`
        aiProgress.value = `AI 正在识别${batchLabel}（${batch.length} 张图片）...`

        try {
          const text = await requestAiStream({
            images: batch.map(image => ({
              imageBase64: image.aiImageBase64,
              mimeType: image.aiMimeType
            })),
            maxTokens: AI_RECOGNITION_MAX_TOKENS,
            stream: true,
            systemPrompt: '你是进货截图识别助手。只返回合法 JSON，不要 Markdown，不要解释。日期格式必须是 YYYY-MM-DD，金额单位为人民币元。',
            userPrompt: buildPurchaseRecognitionPrompt({
              totalImageCount: purchaseImages.value.length,
              batchImageCount: batch.length,
              batchIndex,
              batchCount: imageBatches.length,
              catalog
            })
          }, (delta) => {
            receivedLength += delta.length
            aiProgress.value = `AI 正在识别${batchLabel}，已接收 ${receivedLength} 个字符...`
          })

          aiProgress.value = `${batchLabel}识别完成，正在整理结果...`
          const parsed = extractJsonObject(text || '')
          if (!parsed) {
            warnings.push(`${batchLabel}结果无法解析`)
            continue
          }

          recognizedMetadata = mergeAiMetadata(recognizedMetadata, normalizeAiMetadata(parsed))
          const batchCandidates = prefixBatchCandidateIds(
            normalizeAiCandidates(parsed.items || [], products.value),
            batchIndex
          )
          if (batchCandidates.length === 0) {
            warnings.push(`${batchLabel}未识别到明细`)
            continue
          }

          recognizedCandidates.push(...batchCandidates)
          aiMetadata.value = recognizedMetadata
          aiCandidates.value = mergeAiCandidates(recognizedCandidates)
        } catch (caught) {
          const batchError = normalizeApiError(caught)
          if (recognizedCandidates.length > 0) {
            warnings.push(`${batchLabel}失败：${batchError.message}`)
            break
          }
          throw batchError
        }
      }

      aiMetadata.value = recognizedMetadata
      aiCandidates.value = mergeAiCandidates(recognizedCandidates)
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
      if (!aiError.value) aiProgress.value = ''
    }
  }

  function setAiCandidates(nextCandidates: PurchaseAiCandidate[]) {
    aiCandidates.value = mergeAiCandidates(nextCandidates)
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
