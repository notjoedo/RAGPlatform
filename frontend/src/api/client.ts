export type Provider = 'ollama' | 'openai' | 'anthropic'

export interface Pipeline {
  id: string
  name: string
  created_at: string
}

export interface Document {
  id: string
  pipeline_id: string
  filename: string
  status: 'processing' | 'ready' | 'failed'
  chunk_count: number
  error?: string | null
  created_at: string
}

export interface Health {
  status: string
  ollama_reachable: boolean
  ollama_url: string
}

const API_BASE = '/api'

function headers(apiKey: string): HeadersInit {
  return {
    'X-API-Key': apiKey,
    'Content-Type': 'application/json',
  }
}

async function parseError(res: Response, fallback: string): Promise<string> {
  const err = await res.json().catch(() => ({} as { detail?: unknown }))
  const detail = err.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((item) => (typeof item === 'object' && item && 'msg' in item ? String(item.msg) : String(item)))
      .join(', ')
  }
  return fallback
}

export async function checkHealth(): Promise<Health> {
  const res = await fetch(`${API_BASE}/health`)
  if (!res.ok) throw new Error('Health check failed')
  return res.json()
}

export async function listPipelines(apiKey: string): Promise<Pipeline[]> {
  const res = await fetch(`${API_BASE}/pipelines`, { headers: headers(apiKey) })
  if (!res.ok) throw new Error(await parseError(res, 'Failed to list pipelines'))
  return res.json()
}

export async function createPipeline(apiKey: string, name: string): Promise<Pipeline> {
  const res = await fetch(`${API_BASE}/pipelines`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({ name }),
  })
  if (!res.ok) throw new Error(await parseError(res, 'Failed to create pipeline'))
  return res.json()
}

export async function deletePipeline(apiKey: string, id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/pipelines/${id}`, {
    method: 'DELETE',
    headers: headers(apiKey),
  })
  if (!res.ok) throw new Error(await parseError(res, 'Failed to delete pipeline'))
}

export async function listDocuments(apiKey: string, pipelineId: string): Promise<Document[]> {
  const res = await fetch(`${API_BASE}/pipelines/${pipelineId}/documents`, {
    headers: headers(apiKey),
  })
  if (!res.ok) throw new Error(await parseError(res, 'Failed to list documents'))
  return res.json()
}

function uploadFilename(file: File): string {
  return file.webkitRelativePath || file.name
}

export async function uploadDocument(
  apiKey: string,
  pipelineId: string,
  file: File,
): Promise<Document> {
  const form = new FormData()
  form.append('file', file, uploadFilename(file))
  const res = await fetch(`${API_BASE}/pipelines/${pipelineId}/documents`, {
    method: 'POST',
    headers: { 'X-API-Key': apiKey },
    body: form,
  })
  if (!res.ok) throw new Error(await parseError(res, 'Upload failed'))
  return res.json()
}

export async function uploadDocuments(
  apiKey: string,
  pipelineId: string,
  files: File[],
): Promise<Document[]> {
  const form = new FormData()
  for (const file of files) {
    form.append('files', file, uploadFilename(file))
  }
  const res = await fetch(`${API_BASE}/pipelines/${pipelineId}/documents/batch`, {
    method: 'POST',
    headers: { 'X-API-Key': apiKey },
    body: form,
  })
  if (!res.ok) throw new Error(await parseError(res, 'Upload failed'))
  return res.json()
}

export async function ingestLink(
  apiKey: string,
  pipelineId: string,
  url: string,
): Promise<Document> {
  const res = await fetch(`${API_BASE}/pipelines/${pipelineId}/documents/link`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({ url }),
  })
  if (!res.ok) throw new Error(await parseError(res, 'Failed to ingest link'))
  return res.json()
}

export async function streamChat(
  apiKey: string,
  pipelineId: string,
  message: string,
  provider: Provider,
  providerApiKey: string | null,
  onToken: (token: string) => void,
  _onError: (error: string) => void,
): Promise<void> {
  const res = await fetch(`${API_BASE}/pipelines/${pipelineId}/chat`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({
      message,
      provider,
      api_key: providerApiKey || undefined,
    }),
  })

  if (!res.ok) throw new Error(await parseError(res, 'Chat request failed'))

  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response stream')

  const decoder = new TextDecoder()
  let buffer = ''
  let streamError: string | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6)
      if (data === '[DONE]') {
        if (streamError) throw new Error(streamError)
        return
      }
      try {
        const parsed = JSON.parse(data)
        if (parsed.error) streamError = parsed.error
        else if (parsed.token) onToken(parsed.token)
      } catch {
        // ignore malformed chunks
      }
    }
  }

  if (streamError) throw new Error(streamError)
}
