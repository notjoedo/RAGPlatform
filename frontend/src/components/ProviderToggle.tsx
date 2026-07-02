import type { Provider } from '../api/client'

interface Props {
  provider: Provider
  providerApiKey: string
  onProviderChange: (provider: Provider) => void
  onApiKeyChange: (key: string) => void
}

const PROVIDERS: { value: Provider; label: string }[] = [
  { value: 'ollama', label: 'Ollama' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
]

export default function ProviderToggle({
  provider,
  providerApiKey,
  onProviderChange,
  onApiKeyChange,
}: Props) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center rounded-lg border border-line bg-surface p-0.5">
        {PROVIDERS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => onProviderChange(value)}
            className={`text-[12px] font-medium rounded-md px-2.5 py-1 transition-colors ${
              provider === value
                ? 'bg-panel text-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)] border border-line'
                : 'text-ink-muted hover:text-ink-secondary border border-transparent'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {provider !== 'ollama' && (
        <input
          type="password"
          value={providerApiKey}
          onChange={(e) => onApiKeyChange(e.target.value)}
          placeholder={`${provider === 'openai' ? 'OpenAI' : 'Anthropic'} API key`}
          className="w-44 rounded-lg border border-line-strong bg-panel px-3 py-1.5 text-[12px] placeholder:text-ink-muted focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/5 transition"
        />
      )}
    </div>
  )
}
