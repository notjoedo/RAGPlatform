import { useEffect, useRef, useState } from 'react'
import type { Provider } from '../api/client'
import { streamChat } from '../api/client'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface Props {
  apiKey: string
  pipelineId: string | null
  pipelineName: string | null
  provider: Provider
  providerApiKey: string
}

function TypingIndicator() {
  return (
    <span className="inline-flex items-center gap-1 py-1" aria-label="Assistant is typing">
      <span className="typing-dot w-1.5 h-1.5 rounded-full bg-ink-muted" />
      <span className="typing-dot w-1.5 h-1.5 rounded-full bg-ink-muted" />
      <span className="typing-dot w-1.5 h-1.5 rounded-full bg-ink-muted" />
    </span>
  )
}

export default function ChatPanel({
  apiKey,
  pipelineId,
  pipelineName,
  provider,
  providerApiKey,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const tokenBufferRef = useRef('')
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    setMessages([])
    setError('')
  }, [pipelineId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  const autosize = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  const handleSend = async () => {
    if (!input.trim() || !pipelineId || loading) return
    if (provider !== 'ollama' && !providerApiKey.trim()) {
      setError(`An API key is required for ${provider === 'openai' ? 'OpenAI' : 'Anthropic'}. Add it in the header above.`)
      return
    }

    const userMessage = input.trim()
    setInput('')
    setError('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }])
    setLoading(true)

    let assistantContent = ''
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

    tokenBufferRef.current = ''

    try {
      await streamChat(
        apiKey,
        pipelineId,
        userMessage,
        provider,
        providerApiKey || null,
        (token) => {
          tokenBufferRef.current += token
          if (rafRef.current) return
          rafRef.current = requestAnimationFrame(() => {
            rafRef.current = null
            const flushed = tokenBufferRef.current
            tokenBufferRef.current = ''
            assistantContent += flushed
            setMessages((prev) => {
              const updated = [...prev]
              updated[updated.length - 1] = { role: 'assistant', content: assistantContent }
              return updated
            })
          })
        },
        (err) => {
          throw new Error(err)
        },
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chat failed')
      setMessages((prev) => prev.slice(0, -1))
    } finally {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      setLoading(false)
    }
  }

  if (!pipelineId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-panel border border-line flex items-center justify-center">
          <svg width="22" height="22" viewBox="0 0 16 16" fill="none" className="text-ink-muted" aria-hidden="true">
            <path
              d="M14 7.7C14 10.9 11.3 13.5 8 13.5C7.2 13.5 6.4 13.3 5.7 13.1L2.5 14L3.5 11.3C2.9 10.3 2.5 9 2.5 7.7C2.5 4.5 5 2 8.2 2C11.4 2 14 4.5 14 7.7Z"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div>
          <p className="text-[15px] font-medium text-ink">No pipeline selected</p>
          <p className="text-[13px] text-ink-muted mt-1">
            Select or create a pipeline in the sidebar to start chatting.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="shrink-0 px-6 h-12 flex items-center border-b border-line bg-panel">
        <h1 className="text-[13px] font-medium text-ink truncate">{pipelineName}</h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-6 space-y-5">
          {messages.length === 0 && (
            <div className="pt-16 text-center">
              <p className="text-[15px] font-medium text-ink">Ask about your documents</p>
              <p className="text-[13px] text-ink-muted mt-1">
                Answers are grounded in the files uploaded to this pipeline and cite their sources.
              </p>
            </div>
          )}
          {messages.map((msg, i) => {
            const isLast = i === messages.length - 1
            const showTyping = loading && isLast && msg.role === 'assistant' && !msg.content
            return msg.role === 'user' ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl rounded-br-md bg-accent text-white text-[14px] leading-relaxed px-4 py-2.5 whitespace-pre-wrap wrap-break-word">
                  {msg.content}
                </div>
              </div>
            ) : (
              <div key={i} className="flex gap-3">
                <div className="w-7 h-7 rounded-lg bg-panel border border-line flex items-center justify-center shrink-0 mt-0.5">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="text-ink-secondary" aria-hidden="true">
                    <path
                      d="M2 4.5L8 1.5L14 4.5V11.5L8 14.5L2 11.5V4.5Z"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinejoin="round"
                    />
                    <path d="M2 4.5L8 7.5L14 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                    <path d="M8 7.5V14.5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                  </svg>
                </div>
                <div className="min-w-0 max-w-[85%] text-[14px] leading-relaxed text-ink whitespace-pre-wrap wrap-break-word pt-1">
                  {showTyping ? <TypingIndicator /> : msg.content}
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="shrink-0 border-t border-line bg-panel">
        <div className="max-w-3xl mx-auto px-6 py-4">
          {error && (
            <p className="mb-2.5 text-[12px] text-danger bg-danger-soft rounded-lg px-3 py-2">{error}</p>
          )}
          <div className="flex items-end gap-2 rounded-xl border border-line-strong bg-panel focus-within:border-ink focus-within:ring-2 focus-within:ring-ink/5 transition">
            <textarea
              ref={textareaRef}
              value={input}
              rows={1}
              onChange={(e) => {
                setInput(e.target.value)
                autosize()
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder="Ask a question…"
              disabled={loading}
              className="flex-1 resize-none bg-transparent text-[14px] leading-relaxed px-4 py-3 placeholder:text-ink-muted focus:outline-none disabled:opacity-60"
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              aria-label="Send message"
              className="m-2 w-8 h-8 rounded-lg bg-accent text-white flex items-center justify-center shrink-0 hover:bg-accent-hover disabled:opacity-30 disabled:cursor-not-allowed transition"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M8 12.5V3.5M8 3.5L3.5 8M8 3.5L12.5 8"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
          <p className="mt-2 text-[11px] text-ink-muted text-center">
            Answers cite source files as [filename]. Enter to send, Shift+Enter for a new line.
          </p>
        </div>
      </div>
    </div>
  )
}
