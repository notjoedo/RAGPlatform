import { useState } from 'react'

interface Props {
  onAuthenticated: (apiKey: string) => void
}

export default function ApiKeyGate({ onAuthenticated }: Props) {
  const [key, setKey] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!key.trim()) {
      setError('An API key is required.')
      return
    }
    localStorage.setItem('rag_api_key', key.trim())
    onAuthenticated(key.trim())
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-11 h-11 rounded-xl bg-accent flex items-center justify-center mb-4">
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden="true">
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
          <h1 className="text-xl font-semibold tracking-tight">RAG Platform</h1>
          <p className="text-[13px] text-ink-muted mt-1.5">
            Upload documents. Chat with your knowledge.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-panel border border-line rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
        >
          <label htmlFor="api-key" className="block text-[13px] font-medium text-ink mb-2">
            App API key
          </label>
          <input
            id="api-key"
            type="password"
            value={key}
            onChange={(e) => {
              setKey(e.target.value)
              if (error) setError('')
            }}
            placeholder="Enter your key"
            autoFocus
            className="w-full rounded-lg border border-line-strong bg-panel px-3.5 py-2.5 text-[14px] placeholder:text-ink-muted focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/5 transition"
          />
          {error && <p className="mt-2 text-[12px] text-danger">{error}</p>}
          <button
            type="submit"
            className="mt-4 w-full rounded-lg bg-accent text-white text-[14px] font-medium py-2.5 hover:bg-accent-hover transition-colors"
          >
            Continue
          </button>
          <p className="mt-4 text-[12px] text-ink-muted text-center">
            The key is set via <code className="font-mono text-[11px] bg-surface border border-line rounded px-1 py-0.5">APP_API_KEY</code> on the server.
          </p>
        </form>
      </div>
    </div>
  )
}
