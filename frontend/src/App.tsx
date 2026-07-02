import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  checkHealth,
  createPipeline,
  deleteDocument,
  deletePipeline,
  fetchChatModels,
  listDocuments,
  listPipelines,
  uploadDocument,
  uploadDocuments,
  ingestLink,
  type ChatModelsCatalog,
  type Document,
  type Pipeline,
  type Provider,
} from './api/client'
import ApiKeyGate from './components/ApiKeyGate'
import ChatPanel from './components/ChatPanel'
import PipelineList from './components/PipelineList'
import ProviderToggle from './components/ProviderToggle'
import UploadZone from './components/UploadZone'
import {
  loadStoredModels,
  modelsForProvider,
  resolveSelectedModel,
  saveStoredModel,
} from './models'

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
  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [chatModelsCatalog, setChatModelsCatalog] = useState<ChatModelsCatalog | null>(null)
  const [modelsByProvider, setModelsByProvider] = useState<Record<Provider, string>>({
    ollama: 'llama3.2',
    openai: 'gpt-4o-mini',
    anthropic: 'claude-haiku-4-5-20251001',
  })
  const [loadingPipelines, setLoadingPipelines] = useState(false)
  const [sidebarTab, setSidebarTab] = useState<'pipelines' | 'sources'>('pipelines')
  const docPollRef = useRef<number | null>(null)

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
    Promise.all([checkHealth(), fetchChatModels()])
      .then(([health, catalog]) => {
        setOllamaOk(health.ollama_reachable)
        setOllamaModels(health.ollama_models)
        setChatModelsCatalog(catalog)
        setModelsByProvider(loadStoredModels(catalog.defaults))
      })
      .catch(() => setOllamaOk(false))
  }, [apiKey, loadPipelines])

  const hasProcessingDocs = useMemo(
    () => documents.some((d) => d.status === 'processing'),
    [documents],
  )

  useEffect(() => {
    if (!apiKey || !selectedId) {
      setDocuments([])
      if (docPollRef.current) window.clearInterval(docPollRef.current)
      docPollRef.current = null
      return
    }

    loadDocuments(apiKey, selectedId).catch(console.error)

    if (docPollRef.current) window.clearInterval(docPollRef.current)
    const intervalMs = hasProcessingDocs ? 2000 : 10000
    docPollRef.current = window.setInterval(() => {
      loadDocuments(apiKey, selectedId).catch(console.error)
    }, intervalMs)

    return () => {
      if (docPollRef.current) window.clearInterval(docPollRef.current)
      docPollRef.current = null
    }
  }, [apiKey, selectedId, loadDocuments, hasProcessingDocs])

  useEffect(() => {
    sessionStorage.setItem('provider_api_key', providerApiKey)
  }, [providerApiKey])

  const handleModelChange = (model: string) => {
    setModelsByProvider((prev) => {
      const next = { ...prev, [provider]: model }
      saveStoredModel(provider, model)
      return next
    })
  }

  const modelOptions = chatModelsCatalog
    ? modelsForProvider(chatModelsCatalog, provider, ollamaModels)
    : [{ id: modelsByProvider[provider], label: modelsByProvider[provider] }]

  const selectedModel = chatModelsCatalog
    ? resolveSelectedModel(provider, modelsByProvider, chatModelsCatalog, ollamaModels)
    : modelsByProvider[provider]

  const selectedModelLabel =
    modelOptions.find((option) => option.id === selectedModel)?.label ?? selectedModel

  if (!apiKey) {
    return <ApiKeyGate onAuthenticated={setApiKey} />
  }

  const handleCreate = async (name: string) => {
    const pipeline = await createPipeline(apiKey, name)
    setPipelines((prev) => [pipeline, ...prev.filter((p) => p.id !== pipeline.id)])
    setSelectedId(pipeline.id)
    setSidebarTab('sources')
  }

  const handleDelete = async (id: string) => {
    await deletePipeline(apiKey, id)
    await loadPipelines(apiKey)
  }

  const handleUploadFiles = async (files: File[]) => {
    if (!selectedId || !files.length) return
    if (files.length === 1) {
      await uploadDocument(apiKey, selectedId, files[0])
    } else {
      await uploadDocuments(apiKey, selectedId, files)
    }
    await loadDocuments(apiKey, selectedId)
    setSidebarTab('sources')
  }

  const handleIngestLink = async (url: string) => {
    if (!selectedId) return
    await ingestLink(apiKey, selectedId, url)
    await loadDocuments(apiKey, selectedId)
    setSidebarTab('sources')
  }

  const handleDeleteDocument = async (documentId: string) => {
    if (!selectedId) return
    await deleteDocument(apiKey, selectedId, documentId)
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
            <span className="text-[15px] font-semibold tracking-tight">Joe's RAG</span>
          </div>
          <div className="flex items-center gap-3">
            <ProviderToggle
              provider={provider}
              providerApiKey={providerApiKey}
              modelOptions={modelOptions}
              selectedModel={selectedModel}
              onProviderChange={setProvider}
              onApiKeyChange={setProviderApiKey}
              onModelChange={handleModelChange}
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
          <div className="shrink-0 p-3 border-b border-line">
            <div className="rounded-lg border border-line bg-surface p-0.5 flex">
              <button
                type="button"
                onClick={() => setSidebarTab('pipelines')}
                className={`flex-1 text-[12px] font-medium rounded-md px-2.5 py-1.5 transition ${
                  sidebarTab === 'pipelines'
                    ? 'bg-panel text-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)] border border-line'
                    : 'text-ink-muted hover:text-ink-secondary'
                }`}
              >
                Pipelines
              </button>
              <button
                type="button"
                onClick={() => setSidebarTab('sources')}
                className={`flex-1 text-[12px] font-medium rounded-md px-2.5 py-1.5 transition ${
                  sidebarTab === 'sources'
                    ? 'bg-panel text-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)] border border-line'
                    : 'text-ink-muted hover:text-ink-secondary'
                }`}
              >
                Sources
              </button>
            </div>
          </div>

          {sidebarTab === 'pipelines' ? (
            loadingPipelines && pipelines.length === 0 ? (
              <div className="p-4 text-[13px] text-ink-muted">Loading pipelines…</div>
            ) : (
              <PipelineList
                pipelines={pipelines}
                selectedId={selectedId}
                onSelect={(id) => {
                  setSelectedId(id)
                  setSidebarTab('sources')
                }}
                onCreate={handleCreate}
                onDelete={handleDelete}
              />
            )
          ) : (
            <div className="flex-1 min-h-0">
              <UploadZone
                documents={documents}
                onUploadFiles={handleUploadFiles}
                onIngestLink={handleIngestLink}
                onDeleteDocument={handleDeleteDocument}
                disabled={!selectedId}
              />
            </div>
          )}
        </aside>

        <main className="flex-1 flex flex-col min-w-0 min-h-0">
          <ChatPanel
            apiKey={apiKey}
            pipelineId={selectedId}
            pipelineName={selectedPipeline?.name ?? null}
            provider={provider}
            providerApiKey={providerApiKey}
            chatModel={selectedModel}
            chatModelLabel={selectedModelLabel}
          />
        </main>
      </div>
    </div>
  )
}
