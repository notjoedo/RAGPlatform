import { useCallback, useEffect, useState } from 'react'
import {
  checkHealth,
  createPipeline,
  deletePipeline,
  listDocuments,
  listPipelines,
  uploadDocument,
  ingestLink,
  type Document,
  type Pipeline,
  type Provider,
} from './api/client'
import ApiKeyGate from './components/ApiKeyGate'
import ChatPanel from './components/ChatPanel'
import PipelineList from './components/PipelineList'
import ProviderToggle from './components/ProviderToggle'
import UploadZone from './components/UploadZone'

export default function App() {
  const [apiKey, setApiKey] = useState<string | null>(
    () => localStorage.getItem('rag_api_key'),
  )
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [provider, setProvider] = useState<Provider>('ollama')
  const [providerApiKey, setProviderApiKey] = useState(
    () => sessionStorage.getItem('provider_api_key') || '',
  )
  const [ollamaOk, setOllamaOk] = useState(true)
  const [loadingPipelines, setLoadingPipelines] = useState(false)

  const loadPipelines = useCallback(async (key: string) => {
    setLoadingPipelines(true)
    try {
      const data = await listPipelines(key)
      setPipelines(data)
      setSelectedId((current) => {
        if (current && data.some((p) => p.id === current)) return current
        return data.length ? data[0].id : null
      })
    } finally {
      setLoadingPipelines(false)
    }
  }, [])

  const loadDocuments = useCallback(async (key: string, pipelineId: string) => {
    const data = await listDocuments(key, pipelineId)
    setDocuments(data)
  }, [])

  useEffect(() => {
    if (!apiKey) return
    loadPipelines(apiKey).catch(console.error)
    checkHealth()
      .then((h) => setOllamaOk(h.ollama_reachable))
      .catch(() => setOllamaOk(false))
  }, [apiKey, loadPipelines])

  useEffect(() => {
    if (!apiKey || !selectedId) {
      setDocuments([])
      return
    }
    loadDocuments(apiKey, selectedId).catch(console.error)
    const interval = setInterval(() => {
      loadDocuments(apiKey, selectedId).catch(console.error)
    }, 3000)
    return () => clearInterval(interval)
  }, [apiKey, selectedId, loadDocuments])

  useEffect(() => {
    sessionStorage.setItem('provider_api_key', providerApiKey)
  }, [providerApiKey])

  if (!apiKey) {
    return <ApiKeyGate onAuthenticated={setApiKey} />
  }

  const handleCreate = async (name: string) => {
    const pipeline = await createPipeline(apiKey, name)
    setPipelines((prev) => [pipeline, ...prev.filter((p) => p.id !== pipeline.id)])
    setSelectedId(pipeline.id)
  }

  const handleDelete = async (id: string) => {
    await deletePipeline(apiKey, id)
    await loadPipelines(apiKey)
  }

  const handleUpload = async (file: File) => {
    if (!selectedId) return
    await uploadDocument(apiKey, selectedId, file)
    await loadDocuments(apiKey, selectedId)
  }

  const handleIngestLink = async (url: string) => {
    if (!selectedId) return
    await ingestLink(apiKey, selectedId, url)
    await loadDocuments(apiKey, selectedId)
  }

  const handleSignOut = () => {
    localStorage.removeItem('rag_api_key')
    setApiKey(null)
    setPipelines([])
    setSelectedId(null)
  }

  const selectedPipeline = pipelines.find((p) => p.id === selectedId) ?? null

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <header className="shrink-0 bg-panel border-b border-line">
        <div className="px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center shrink-0">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M2 4.5L8 1.5L14 4.5V11.5L8 14.5L2 11.5V4.5Z"
                  stroke="white"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
                <path d="M2 4.5L8 7.5L14 4.5" stroke="white" strokeWidth="1.4" strokeLinejoin="round" />
                <path d="M8 7.5V14.5" stroke="white" strokeWidth="1.4" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="text-[15px] font-semibold tracking-tight">RAG Platform</span>
          </div>
          <div className="flex items-center gap-3">
            <ProviderToggle
              provider={provider}
              providerApiKey={providerApiKey}
              onProviderChange={setProvider}
              onApiKeyChange={setProviderApiKey}
            />
            <div className="w-px h-5 bg-line" aria-hidden="true" />
            <button
              type="button"
              onClick={handleSignOut}
              className="text-[13px] text-ink-secondary hover:text-ink transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
        {!ollamaOk && provider === 'ollama' && (
          <div className="px-6 py-2 bg-warning-soft border-t border-line flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0" aria-hidden="true">
              <path
                d="M8 5.5V8.5M8 11V11.01M14.5 13H1.5L8 2L14.5 13Z"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-warning"
              />
            </svg>
            <p className="text-[13px] text-warning">
              Ollama is not reachable. Start Ollama locally or switch to OpenAI or Anthropic above.
            </p>
          </div>
        )}
      </header>

      <div className="flex-1 flex min-h-0">
        <aside className="w-72 shrink-0 bg-panel border-r border-line flex flex-col min-h-0">
          {loadingPipelines && pipelines.length === 0 ? (
            <div className="p-4 text-[13px] text-ink-muted">Loading pipelines…</div>
          ) : (
            <PipelineList
              pipelines={pipelines}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onCreate={handleCreate}
              onDelete={handleDelete}
            />
          )}
          <UploadZone
            documents={documents}
            onUpload={handleUpload}
            onIngestLink={handleIngestLink}
            disabled={!selectedId}
          />
        </aside>

        <main className="flex-1 flex flex-col min-w-0 min-h-0">
          <ChatPanel
            apiKey={apiKey}
            pipelineId={selectedId}
            pipelineName={selectedPipeline?.name ?? null}
            provider={provider}
            providerApiKey={providerApiKey}
          />
        </main>
      </div>
    </div>
  )
}
