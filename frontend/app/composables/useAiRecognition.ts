import type { ApiError } from '~/types/api'

export type AiRecognitionImage = {
  id: string
  imageBase64: string
  mimeType: string
  aiImageBase64: string
  aiMimeType: string
  fileName: string
  previewUrl: string
}

export type AiRecognitionPromptOptions = {
  totalImageCount: number
  batchImageCount: number
  batchIndex: number
  batchCount: number
}

type RecognizeImageBatchOptions<TParsed> = {
  images: readonly AiRecognitionImage[]
  batchSize?: number
  maxTokens: number
  systemPrompt: string
  buildUserPrompt: (options: AiRecognitionPromptOptions) => string
  parseResult?: (text: string) => TParsed | null
  onProgress?: (message: string) => void
  onBatchResult?: (parsed: TParsed, batchIndex: number) => boolean | void
}

type RecognizeImageBatchResult<TParsed> = {
  parsedResults: TParsed[]
  warnings: string[]
}

const AI_IMAGE_MAX_EDGE = 1600
const AI_IMAGE_MAX_ORIGINAL_BYTES = 900 * 1024
const AI_IMAGE_JPEG_QUALITY = 0.84
const DEFAULT_AI_IMAGE_BATCH_SIZE = 4

export const AI_HUMAN_CONFIRMATION_RULE = 'AI 结果只用于人工确认，不能自动入账。'
export const AI_PRODUCT_MATCHING_RULES = [
  '匹配规则：尽量在下面给出的商品清单中找最接近的一项，返回它的 productId；若清单中没有相似项，productId 留空字符串，rawName 保留截图原文。',
  '注意名称同义：如"毫升=ml"、"克=g"、"瓶装"可省略、"1L=1000ml"。',
  AI_HUMAN_CONFIRMATION_RULE
]

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

function chunkList<T>(items: readonly T[], size: number) {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function streamError(message: string): ApiError {
  return {
    code: 'UNKNOWN_ERROR',
    message
  }
}

export function extractAiJsonObject<TParsed>(text: string): TParsed | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1)) as TParsed
  } catch {
    return null
  }
}

export function roundAiMoney(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100
}

export function useAiRecognition() {
  const config = useRuntimeConfig()

  async function readImageFile(file: File, index = 0): Promise<AiRecognitionImage> {
    const originalDataUrl = await readBlobAsDataUrl(file)
    const optimizedDataUrl = await optimizeImageForAi(file, originalDataUrl)
    const originalImage = splitDataUrl(originalDataUrl, file.type || 'image/jpeg')
    const aiImage = splitDataUrl(optimizedDataUrl, file.type || 'image/jpeg')
    return {
      imageBase64: originalImage.imageBase64,
      mimeType: originalImage.mimeType,
      aiImageBase64: aiImage.imageBase64,
      aiMimeType: aiImage.mimeType,
      previewUrl: originalDataUrl,
      id: `${Date.now()}-${index}-${file.name}`,
      fileName: file.name
    }
  }

  async function readImageFiles(files: File[] | File) {
    const nextFiles = Array.isArray(files) ? files : [files]
    return Promise.all(nextFiles.map((file, index) => readImageFile(file, index)))
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

  async function recognizeImageBatches<TParsed>(
    options: RecognizeImageBatchOptions<TParsed>
  ): Promise<RecognizeImageBatchResult<TParsed>> {
    const batches = chunkList(options.images, options.batchSize || DEFAULT_AI_IMAGE_BATCH_SIZE)
    const parsedResults: TParsed[] = []
    const warnings: string[] = []

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      const batch = batches[batchIndex] || []
      let receivedLength = 0
      const batchLabel = `第 ${batchIndex + 1}/${batches.length} 批`
      options.onProgress?.(`AI 正在识别${batchLabel}（${batch.length} 张图片）...`)

      try {
        const text = await requestAiStream({
          images: batch.map(image => ({
            imageBase64: image.aiImageBase64,
            mimeType: image.aiMimeType
          })),
          maxTokens: options.maxTokens,
          stream: true,
          systemPrompt: options.systemPrompt,
          userPrompt: options.buildUserPrompt({
            totalImageCount: options.images.length,
            batchImageCount: batch.length,
            batchIndex,
            batchCount: batches.length
          })
        }, (delta) => {
          receivedLength += delta.length
          options.onProgress?.(`AI 正在识别${batchLabel}，已接收 ${receivedLength} 个字符...`)
        })

        options.onProgress?.(`${batchLabel}识别完成，正在整理结果...`)
        const parsed = options.parseResult
          ? options.parseResult(text || '')
          : extractAiJsonObject<TParsed>(text || '')
        if (!parsed) {
          warnings.push(`${batchLabel}结果无法解析`)
          continue
        }

        const accepted = options.onBatchResult?.(parsed, batchIndex)
        if (accepted === false) {
          warnings.push(`${batchLabel}未识别到明细`)
          continue
        }
        parsedResults.push(parsed)
      } catch (caught) {
        const batchError = normalizeApiError(caught)
        if (parsedResults.length > 0) {
          warnings.push(`${batchLabel}失败：${batchError.message}`)
          break
        }
        throw batchError
      }
    }

    return { parsedResults, warnings }
  }

  return {
    readImageFile,
    readImageFiles,
    requestAiStream,
    recognizeImageBatches
  }
}
