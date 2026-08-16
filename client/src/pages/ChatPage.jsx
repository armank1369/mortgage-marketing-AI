import { useState, useRef, useEffect } from 'react'
import axios from 'axios'
import CalendarPage from './CalendarPage'
import PreferenceSetup from './PreferenceSetup'
import CampaignResponse from '../components/CampaignResponse'
import ClarificationResponse from '../components/ClarificationResponse'
import PostsResponse from '../components/PostsResponse'
import Section from '../components/Section'
import { usePreferences } from '../context/PreferencesContext'
import { loadChatsFromStorage, saveChatsToStorage } from '../utils/storage'
import { NMLS_NUMBER } from '../constants'

// crypto.randomUUID() only exists in a secure context (HTTPS, or the special-cased
// "localhost") — it throws on plain http://<lan-ip>, which is exactly how this app gets
// opened from a phone during local dev testing, crashing the whole page on the first
// message. This falls back to a good-enough unique id everywhere else.
function makeId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

const QUICK_PROMPTS = [
  'Give me a post idea',
  'What should I post this week?',
  'Write me a caption',
  'How do I get more leads?',
  'Create a content strategy and 2-week social media calendar for my mortgage brand',
]

const NAV_ITEMS = [
  { id: 'chat', label: 'Chat', icon: '💬' },
  { id: 'calendar', label: 'Calendar', icon: '📅' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
]

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  )
}

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}

const PERSONA_DESCRIPTIONS = {
  'self-employed':
    'Age 35-60, self-employed or entrepreneur with complex finances and significant tax write-offs. Traditional banks have turned them away. Non-QM borrower with good to excellent credit and 2 or more years of business ownership. Core message: Find a solution without cutting corners.',
}

const TONE_SCALES = [
  { key: 'professional', low: 'Professional', high: 'Casual' },
  { key: 'authoritative', low: 'Authoritative', high: 'Conversational' },
  { key: 'serious', low: 'Serious', high: 'Humorous' },
  { key: 'matterOfFact', low: 'Matter of Fact', high: 'Enthusiastic' },
]

export default function ChatPage() {
  const { preferences } = usePreferences()
  const [activeNav, setActiveNav] = useState('chat')
  const storedChats = useRef(loadChatsFromStorage()).current
  const [chats, setChats] = useState(() => {
    if (storedChats && Array.isArray(storedChats.chats) && storedChats.chats.length === 3) {
      return storedChats.chats
    }
    return [
      { id: 1, label: 'Chat 1', persona: preferences.persona || null, messages: [] },
      { id: 2, label: 'Chat 2', persona: null, messages: [] },
      { id: 3, label: 'Chat 3', persona: null, messages: [] },
    ]
  })
  const [activeChatId, setActiveChatId] = useState(() => storedChats?.activeChatId ?? 1)
  const [showSetup, setShowSetup] = useState(false)
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [chatToDelete, setChatToDelete] = useState(null)
  const [showPersonaModal, setShowPersonaModal] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const endRef = useRef(null)
  const abortControllerRef = useRef(null)

  const nmls = NMLS_NUMBER

  const activeChat = chats.find((c) => c.id === activeChatId) || chats[0]
  const messages = activeChat?.messages || []

  const activePersona = activeChat?.persona || preferences.persona
  const persona = activePersona?.apiKey || 'self-employed'
  const isDefaultPersona = persona === 'self-employed'

  const personaLabel = activePersona?.name || 'No persona'

  const personaColor = isDefaultPersona
    ? 'bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/20'
    : 'bg-violet-500/10 text-violet-300 ring-1 ring-violet-500/20'

  const actionBtnClass = 'text-xs text-slate-400 hover:text-slate-600 transition-colors px-2 py-1 rounded-md hover:bg-slate-100'

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeChat?.messages, isTyping])

  useEffect(() => {
    saveChatsToStorage(chats, activeChatId)
  }, [chats, activeChatId])

  const updateActiveChatMessages = (updater) => {
    setChats((prev) =>
      prev.map((c) =>
        c.id === activeChatId ? { ...c, messages: updater(c.messages) } : c
      )
    )
  }

  const handleSetupComplete = (persona) => {
    setShowSetup(false)
    if (!persona) return
    const emptyChat = chats.find((c) => c.messages.length === 0)
    if (emptyChat) {
      setActiveChatId(emptyChat.id)
      setChats((prev) =>
        prev.map((c) => (c.id === emptyChat.id ? { ...c, persona } : c))
      )
    } else {
      setChats((prev) =>
        prev.map((c) => (c.id === activeChatId ? { ...c, persona } : c))
      )
    }
  }

  const sendMessage = async (message) => {
    setIsTyping(true)
    const controller = new AbortController()
    abortControllerRef.current = controller
    try {
      const { data } = await axios.post(
        '/api/chat',
        { message, persona, nmls_number: nmls },
        { signal: controller.signal }
      )
      if (data.type === 'campaign') {
        updateActiveChatMessages((msgs) => [
          ...msgs,
          { id: makeId(), role: 'assistant', type: 'campaign', campaign: data.campaign, prompt: message },
        ])
      } else if (data.type === 'clarification') {
        updateActiveChatMessages((msgs) => [
          ...msgs,
          { id: makeId(), role: 'assistant', type: 'clarification', clarification: data.clarification, prompt: message },
        ])
      } else if (data.type === 'posts') {
        updateActiveChatMessages((msgs) => [
          ...msgs,
          { id: makeId(), role: 'assistant', type: 'posts', posts: data.posts, prompt: message },
        ])
      } else {
        updateActiveChatMessages((msgs) => [
          ...msgs,
          { id: makeId(), role: 'assistant', type: 'text', text: data.response, prompt: message },
        ])
      }
    } catch (err) {
      // Cancelled by clearChat (or a superseded request) — the chat that would have
      // received this response may no longer exist in its old form, so there's nothing
      // to report back for it.
      if (axios.isCancel(err)) return
      updateActiveChatMessages((msgs) => [
        ...msgs,
        {
          id: makeId(),
          role: 'assistant',
          type: 'text',
          text: 'Sorry, I could not generate a response. Please check that the server is running and try again.',
          prompt: message,
        },
      ])
    } finally {
      // Only clear isTyping/abortControllerRef if a newer request hasn't already
      // taken over — otherwise a slow-to-settle cancelled request could clobber it.
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null
        setIsTyping(false)
      }
    }
  }

  const handleSend = (text) => {
    const msg = (text ?? input).trim()
    if (!msg || isTyping) return
    const personaObj = activeChat.persona || preferences.persona
    if (personaObj && !activeChat.persona) {
      setChats((prev) =>
        prev.map((c) => (c.id === activeChatId ? { ...c, persona: personaObj } : c))
      )
    }
    updateActiveChatMessages((msgs) => [...msgs, { id: makeId(), role: 'user', text: msg }])
    setInput('')
    sendMessage(msg)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const regenerate = (index) => {
    const msg = messages[index]
    setIsTyping(true)
    updateActiveChatMessages((msgs) => msgs.filter((_, i) => i !== index))
    sendMessage(msg.prompt)
  }

  const setCalendarEntryVideo = (msgIndex, entryIndex, video) => {
    updateActiveChatMessages((msgs) => {
      const updated = [...msgs]
      const msg = updated[msgIndex]
      if (!msg || msg.type !== 'campaign') return msgs
      const content_calendar = msg.campaign.content_calendar.map((entry, i) =>
        i === entryIndex ? { ...entry, video } : entry
      )
      updated[msgIndex] = { ...msg, campaign: { ...msg.campaign, content_calendar } }
      return updated
    })
  }

  const submitClarificationAnswers = (index, answersText) => {
    const msg = messages[index]
    // Lock the checkboxes to show they were answered, but skip echoing the answers back as
    // a separate chat bubble — the locked card already shows what was selected, so a second
    // "Answers:" bubble is redundant. Go straight from checkboxes to the generated output.
    updateActiveChatMessages((msgs) => {
      const updated = [...msgs]
      updated[index] = { ...updated[index], submitted: true }
      return updated
    })
    sendMessage(`Original request: ${msg.prompt}\n\nAnswers:\n${answersText}`)
  }

  const makeShorter = (index) => {
    updateActiveChatMessages((msgs) => {
      const updated = [...msgs]
      if (updated[index].type === 'campaign') return updated
      const original = updated[index].text
      const lines = original.split('\n').filter(Boolean)
      const shortened = lines.slice(0, 2).join('\n') + `\n\n— Joseph Kim | NMLS #${nmls}`
      updated[index] = { role: 'assistant', type: 'text', text: shortened, prompt: updated[index].prompt }
      return updated
    })
  }

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // fallback
    }
  }

  const clearChat = () => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    setIsTyping(false)
    updateActiveChatMessages(() => [])
    setShowClearConfirm(false)
  }

  const confirmDeleteChat = () => {
    if (!chatToDelete) return
    const id = chatToDelete.id
    setChats((prev) =>
      prev.map((c) => (c.id === id ? { ...c, persona: null, messages: [] } : c))
    )
    if (id === activeChatId) {
      const next = chats
        .filter((c) => c.id !== id && c.messages.length > 0)
        .sort((a, b) => a.id - b.id)[0]
      setActiveChatId(next ? next.id : 1)
    }
    setChatToDelete(null)
  }

  if (showSetup) {
    return <PreferenceSetup onComplete={handleSetupComplete} />
  }

  return (
    // h-dvh (not h-screen/100vh) so the layout tracks Safari's actual visible viewport on
    // iPhone — 100vh is fixed to the toolbar-collapsed height, which cuts off or requires
    // scrolling to reach the message input while the address bar is still showing.
    <div className="h-dvh flex bg-slate-50 overflow-hidden">
      {/* Backdrop — mobile only, closes the drawer on tap-outside */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar — static column on desktop, off-canvas drawer on mobile */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 w-64 md:w-56 bg-slate-900 flex flex-col shrink-0 transform transition-transform duration-200 ease-out md:transform-none ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-5 border-b border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-md bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
                JM
              </div>
              <h1 className="text-sm font-bold text-white">MoJoJo SMM AI</h1>
            </div>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close menu"
              className="md:hidden p-1 text-slate-400 hover:text-white transition-colors"
            >
              <CloseIcon />
            </button>
          </div>
          <div className={`mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${personaColor}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            {personaLabel}
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setActiveNav(item.id)
                setSidebarOpen(false)
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeNav === item.id
                  ? 'bg-blue-500/15 text-blue-300'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setShowSetup(true)
              setSidebarOpen(false)
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 mt-3 rounded-lg text-sm font-medium transition-colors text-slate-400 hover:text-slate-200 hover:bg-slate-800 border-t border-slate-800"
          >
            <span className="text-base">➕</span>
            New Chat
          </button>

          <div className="pt-3 space-y-1">
            {chats
              .filter((chat) => chat.persona)
              .map((chat, index) => {
                const isActive = chat.id === activeChatId
                // Label reflects position in the visible list, not the fixed underlying slot
                // id — so after a chat is deleted, the remaining ones renumber from 1 instead
                // of leaving a gap (e.g. deleting Chat 1 no longer leaves "Chat 2, Chat 3").
                const displayLabel = `Chat ${index + 1}`
                return (
                  <div
                    key={chat.id}
                    onClick={() => {
                      setActiveChatId(chat.id)
                      setSidebarOpen(false)
                    }}
                    className={`group relative w-full flex flex-col items-start px-3 py-2 rounded-lg text-left cursor-pointer transition-colors ${
                      isActive
                        ? 'bg-slate-700 text-white'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                  >
                    <span className="text-sm font-medium">{displayLabel}</span>
                    <span className={`text-[11px] ${isActive ? 'text-slate-300' : 'text-slate-500'}`}>
                      {chat.persona ? chat.persona.name : 'Empty'}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setChatToDelete(chat)
                      }}
                      aria-label={`Delete ${displayLabel}`}
                      className={`absolute top-2 right-2 p-1 rounded-md transition-all opacity-0 group-hover:opacity-100 ${
                        isActive
                          ? 'text-slate-300 hover:text-red-300 hover:bg-white/10'
                          : 'text-slate-400 hover:text-red-500 hover:bg-slate-700'
                      }`}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                )
              })}
          </div>
        </nav>

        <div className="p-4 border-t border-slate-800 text-xs text-slate-500">
          {preferences.name} | NMLS #{nmls}
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar — hamburger to open the drawer, hidden on desktop where the sidebar is always visible */}
        <div className="md:hidden flex items-center gap-3 bg-slate-900 px-4 py-3 shrink-0">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
            className="text-slate-300 hover:text-white transition-colors p-1"
          >
            <MenuIcon />
          </button>
          <span className="text-sm font-bold text-white">MoJoJo SMM AI</span>
        </div>

        {activeNav === 'calendar' ? (
          <CalendarPage />
        ) : activeNav === 'settings' ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-14 h-14 rounded-xl bg-blue-50 flex items-center justify-center text-2xl mb-4 mx-auto">⚙️</div>
              <p className="text-slate-900 font-semibold text-sm">Settings</p>
              <p className="text-slate-400 text-xs mt-1">Settings coming soon</p>
            </div>
          </div>
        ) : (
        <>
        {/* Chat header */}
        <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 shrink-0">
          <div className="flex items-center justify-between flex-wrap gap-x-2 gap-y-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <h2 className="text-sm font-semibold text-slate-900">Chat</h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline text-xs text-slate-400">
                NMLS #{nmls}
              </span>
              <button
                type="button"
                onClick={() => setShowClearConfirm(true)}
                className="text-xs text-slate-400 bg-slate-100 hover:bg-red-50 hover:text-red-500 px-2.5 py-1 rounded-full font-medium transition-colors"
              >
                Clear Chat
              </button>
              <button
                type="button"
                onClick={() => setShowPersonaModal(true)}
                className="text-xs text-slate-400 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 px-2.5 py-1 rounded-full font-medium transition-colors max-w-[160px] sm:max-w-none truncate"
              >
                Persona: {personaLabel}
              </button>
            </div>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-5">
          {messages.length === 0 && !isTyping && (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-14 h-14 rounded-xl bg-blue-50 flex items-center justify-center text-2xl mb-4">
                💬
              </div>
              <p className="text-slate-900 font-semibold text-sm">Start a conversation</p>
              <p className="text-slate-400 text-xs mt-1">Ask for a caption, post idea, or content strategy</p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={msg.id ?? i}>
              {msg.role === 'assistant' && msg.type === 'campaign' ? (
                <div className="flex justify-start">
                  <CampaignResponse
                    data={msg.campaign}
                    nmls={nmls}
                    persona={persona}
                    onVideoGenerated={(entryIndex, video) => setCalendarEntryVideo(i, entryIndex, video)}
                  />
                </div>
              ) : msg.role === 'assistant' && msg.type === 'clarification' ? (
                <div className="flex justify-start">
                  <ClarificationResponse
                    data={msg.clarification}
                    submitted={msg.submitted}
                    onSubmit={(answersText) => submitClarificationAnswers(i, answersText)}
                  />
                </div>
              ) : msg.role === 'assistant' && msg.type === 'posts' ? (
                <div className="flex justify-start">
                  <PostsResponse data={msg.posts} />
                </div>
              ) : msg.role === 'assistant' ? (
                // Same card chrome as CampaignResponse's Section component — every AI
                // reply reads as one visual system, not just campaign output.
                <div className="flex justify-start">
                  <div className="w-full max-w-3xl">
                    <Section icon="💬" title="AI Response" defaultOpen>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                    </Section>
                  </div>
                </div>
              ) : (
                <div className="flex justify-end">
                  <div className="max-w-[85%] sm:max-w-[70%] rounded-2xl px-5 py-3.5 whitespace-pre-wrap leading-relaxed text-sm bg-blue-600 text-white shadow-sm shadow-blue-200">
                    {msg.text}
                  </div>
                </div>
              )}

              {msg.role === 'assistant' && (msg.type === 'campaign' || msg.type === 'clarification' || msg.type === 'posts') && (
                <div className="flex justify-start mt-2 ml-1">
                  <button onClick={() => regenerate(i)} className={actionBtnClass}>
                    🔄 Regenerate
                  </button>
                </div>
              )}

              {msg.role === 'assistant' && msg.type === 'text' && (
                <div className="flex justify-start mt-2 ml-1">
                  <div className="flex gap-1">
                    <button onClick={() => copyText(msg.text)} className={actionBtnClass}>
                      📋 Copy
                    </button>
                    <button onClick={() => regenerate(i)} className={actionBtnClass}>
                      🔄 Regenerate
                    </button>
                    <button onClick={() => makeShorter(i)} className={actionBtnClass}>
                      ✂️ Make it shorter
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-white border border-slate-200 rounded-2xl px-5 py-4 shadow-sm">
                <div className="flex gap-1.5">
                  <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
                  <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
                  <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={endRef} />
        </div>

        {/* Quick prompts + input */}
        <div className="bg-white border-t border-slate-200 px-4 sm:px-6 py-4 shrink-0">
          <div className="max-w-4xl mx-auto">
            <div className="flex flex-wrap gap-2 mb-3">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleSend(prompt)}
                  disabled={isTyping}
                  className="text-xs bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-500 px-3 py-1.5 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {prompt}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                className="flex-1 border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-slate-50/50 placeholder:text-slate-400"
              />
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || isTyping}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm shadow-blue-200 inline-flex items-center gap-2"
              >
                {isTyping && (
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                )}
                {isTyping ? 'Generating...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
        </>
        )}
      </div>

      {/* Clear Chat confirmation */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-sm font-semibold text-slate-900">
              Are you sure you want to clear this conversation?
            </h3>
            <p className="text-xs text-slate-500 mt-1">This cannot be undone.</p>
            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 text-slate-500 hover:text-slate-700 text-xs font-medium py-2 rounded-lg transition-colors border border-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={clearChat}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold py-2 rounded-lg transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete chat confirmation */}
      {chatToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-sm font-semibold text-slate-900">
              Delete this chat? This cannot be undone.
            </h3>
            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={() => setChatToDelete(null)}
                className="flex-1 text-slate-500 hover:text-slate-700 text-xs font-medium py-2 rounded-lg transition-colors border border-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteChat}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold py-2 rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Brand summary modal */}
      {showPersonaModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-6">
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">Brand Summary</h3>
              <button
                type="button"
                onClick={() => setShowPersonaModal(false)}
                aria-label="Close"
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Active Persona</h4>
                <p className="mt-2 text-sm font-semibold text-slate-900">{activePersona?.name}</p>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                  {PERSONA_DESCRIPTIONS[persona] || activePersona?.description || 'No persona configured.'}
                </p>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Brand Voice</h4>
                <p className="mt-2 text-sm text-slate-700 leading-relaxed">
                  {preferences.coreValues || 'Not configured.'}
                </p>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Tone of Voice</h4>
                <div className="space-y-4">
                  {TONE_SCALES.map((scale) => {
                    const value = preferences.tone?.[scale.key]
                    return (
                      <div key={scale.key}>
                        <div className="flex justify-between text-[11px] text-slate-500">
                          <span>{scale.low}</span>
                          <span>{scale.high}</span>
                        </div>
                        <div className="flex gap-1 mt-1.5">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <span
                              key={n}
                              className={`h-2 flex-1 rounded-full ${
                                value === n ? 'bg-blue-800' : 'bg-slate-200'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Target Audience</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-[11px] text-slate-500 font-medium">Age range</p>
                    <p className="mt-1 text-sm text-slate-700">
                      {preferences.ageRange ? `Age range: ${preferences.ageRange[0]}-${preferences.ageRange[1]}` : 'Not configured.'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500 font-medium">Income</p>
                    <p className="mt-1 text-sm text-slate-700">{preferences.income || 'Not configured.'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500 font-medium">Education</p>
                    <p className="mt-1 text-sm text-slate-700">{preferences.education || 'Not configured.'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500 font-medium">Pain points</p>
                    <p className="mt-1 text-sm text-slate-700">{preferences.painPoints || 'Not configured.'}</p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">NMLS Number</h4>
                <p className="mt-2 text-sm text-slate-700">NMLS #{nmls}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
