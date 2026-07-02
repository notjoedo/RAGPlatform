import type { Provider } from './api/client'

export interface ChatModelOption {
  id: string
  label: string
}

export interface ChatModelsCatalog {
  anthropic: ChatModelOption[]
  openai: ChatModelOption[]
  defaults: Record<Provider, string>
}

const MODEL_STORAGE_KEY = 'chat_model_by_provider'

export function loadStoredModels(defaults: Record<Provider, string>): Record<Provider, string> {
  try {
    const raw = sessionStorage.getItem(MODEL_STORAGE_KEY)
    if (!raw) return { ...defaults }
    const parsed = JSON.parse(raw) as Partial<Record<Provider, string>>
    return {
      ollama: parsed.ollama || defaults.ollama,
      openai: parsed.openai || defaults.openai,
      anthropic: parsed.anthropic || defaults.anthropic,
    }
  } catch {
    return { ...defaults }
  }
}

export function saveStoredModel(provider: Provider, model: string) {
  const current = loadStoredModels({ ollama: '', openai: '', anthropic: '' })
  current[provider] = model
  sessionStorage.setItem(MODEL_STORAGE_KEY, JSON.stringify(current))
}

export function modelsForProvider(
  catalog: ChatModelsCatalog,
  provider: Provider,
  ollamaModels: string[],
): ChatModelOption[] {
  if (provider === 'anthropic') return catalog.anthropic
  if (provider === 'openai') return catalog.openai
  if (ollamaModels.length) {
    return ollamaModels.map((id) => ({ id, label: id }))
  }
  return [{ id: catalog.defaults.ollama, label: catalog.defaults.ollama }]
}

export function resolveSelectedModel(
  provider: Provider,
  selected: Record<Provider, string>,
  catalog: ChatModelsCatalog,
  ollamaModels: string[],
): string {
  const options = modelsForProvider(catalog, provider, ollamaModels)
  const current = selected[provider]
  if (options.some((option) => option.id === current)) return current
  return catalog.defaults[provider]
}
