import type { MaybeRefOrGetter } from 'vue'
import { onMounted, onUnmounted, toValue } from 'vue'

interface UseClipboardImagePasteOptions {
  enabled: MaybeRefOrGetter<boolean>
  fileNamePrefix: string
  onImage: (file: File) => void
}

function mimeTypeToExtension(mimeType: string) {
  const subtype = mimeType.split('/')[1]?.split(';')[0]?.toLowerCase()
  if (!subtype) return 'png'
  if (subtype === 'jpeg') return 'jpg'
  return subtype.replace(/[^a-z0-9]/g, '') || 'png'
}

function getClipboardImageFile(event: ClipboardEvent, fileNamePrefix: string) {
  const items = Array.from(event.clipboardData?.items || [])
  const imageItem = items.find(item => item.kind === 'file' && item.type.startsWith('image/'))
  const file = imageItem?.getAsFile()
  if (!file) return null

  const mimeType = file.type || 'image/png'
  const extension = mimeTypeToExtension(mimeType)
  return new File([file], `${fileNamePrefix}-${Date.now()}.${extension}`, { type: mimeType })
}

export function useClipboardImagePaste(options: UseClipboardImagePasteOptions) {
  function handlePaste(event: ClipboardEvent) {
    if (!toValue(options.enabled)) return

    const file = getClipboardImageFile(event, options.fileNamePrefix)
    if (!file) return

    event.preventDefault()
    options.onImage(file)
  }

  onMounted(() => {
    window.addEventListener('paste', handlePaste)
  })

  onUnmounted(() => {
    window.removeEventListener('paste', handlePaste)
  })

  return {
    handlePaste
  }
}
