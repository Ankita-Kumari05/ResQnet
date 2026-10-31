import React, { useState, useEffect, useRef } from 'react'

interface VoiceAiModalProps {
  isOpen: boolean
  onClose: () => void
  userLocation?: { lat: number; lng: number } | null
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export const VoiceAiModal: React.FC<VoiceAiModalProps> = ({
  isOpen,
  onClose,
  userLocation,
}) => {
  const [isStartingEngine, setIsStartingEngine] = useState(false)
  const [engineReady, setEngineReady] = useState(false)
  const [engineStatus, setEngineStatus] = useState<string>('Initializing...')
  const [isListening, setIsListening] = useState(false)
  const [isThinking, setIsThinking] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'init-1',
      role: 'assistant',
      content: 'I am ResQnet AI Emergency Assistant. Tell me your immediate danger, location, or medical need.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ])
  const [inputText, setInputText] = useState('')
  const [audioVolume, setAudioVolume] = useState(0)
  const [selectedLanguage, setSelectedLanguage] = useState('en')

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const recognitionRef = useRef<any>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null)
  const chatScrollRef = useRef<HTMLDivElement | null>(null)

  // Auto-scroll chat messages
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
    }
  }, [messages])

  // 1. Check or start AI engine whenever modal opens
  useEffect(() => {
    if (!isOpen) {
      stopVoiceCapture()
      return
    }

    let isMounted = true

    async function ensureEngineRunning() {
      setIsStartingEngine(true)
      setEngineStatus('Checking ResQnet-AI Engine...')

      try {
        // First check if already responding via Vite proxy
        const healthRes = await fetch('/ai-api/health').catch(() => null)
        if (healthRes && healthRes.ok) {
          if (isMounted) {
            setEngineReady(true)
            setIsStartingEngine(false)
            setEngineStatus('Online & Ready')
          }
          return
        }

        // Backend is offline, trigger auto-start via launcher service
        setEngineStatus('Turning on ResQnet-AI backend engine (port 8010)...')
        const startRes = await fetch('/ai-launcher/start', { method: 'POST' }).catch(() => null)

        if (startRes && startRes.ok) {
          const startData = await startRes.json()
          if (startData.running) {
            if (isMounted) {
              setEngineReady(true)
              setIsStartingEngine(false)
              setEngineStatus('Online & Ready')
            }
            return
          }
        }

        // Poll for up to 12s
        for (let i = 0; i < 24; i++) {
          await new Promise((r) => setTimeout(r, 500))
          if (!isMounted) return
          const retryRes = await fetch('/ai-api/health').catch(() => null)
          if (retryRes && retryRes.ok) {
            if (isMounted) {
              setEngineReady(true)
              setIsStartingEngine(false)
              setEngineStatus('Online & Ready')
            }
            return
          }
        }

        if (isMounted) {
          setIsStartingEngine(false)
          setEngineStatus('Connection Timeout. Please retry.')
        }
      } catch (err) {
        if (isMounted) {
          setIsStartingEngine(false)
          setEngineStatus('Could not auto-start backend')
        }
      }
    }

    ensureEngineRunning()

    return () => {
      isMounted = false
    }
  }, [isOpen])

  // 2. Animated Pulse Orb on HTML Canvas
  useEffect(() => {
    if (!isOpen) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let angle = 0

    const render = () => {
      const width = canvas.width
      const height = canvas.height
      ctx.clearRect(0, 0, width, height)

      const cx = width / 2
      const cy = height / 2

      // Base radius varies with volume or state
      let radius = 40 + audioVolume * 30
      if (isThinking) {
        radius = 45 + Math.sin(angle * 4) * 6
      } else if (isSpeaking) {
        radius = 50 + Math.sin(angle * 6) * 12
      } else if (isListening) {
        radius = 45 + Math.sin(angle * 2) * 5 + audioVolume * 25
      }

      // Outer glow
      const gradient = ctx.createRadialGradient(cx, cy, radius * 0.4, cx, cy, radius * 1.5)
      if (isListening) {
        gradient.addColorStop(0, 'rgba(147, 51, 234, 0.8)')
        gradient.addColorStop(0.5, 'rgba(236, 72, 153, 0.4)')
        gradient.addColorStop(1, 'rgba(147, 51, 234, 0)')
      } else if (isThinking) {
        gradient.addColorStop(0, 'rgba(59, 130, 246, 0.8)')
        gradient.addColorStop(0.5, 'rgba(14, 165, 233, 0.4)')
        gradient.addColorStop(1, 'rgba(59, 130, 246, 0)')
      } else if (isSpeaking) {
        gradient.addColorStop(0, 'rgba(16, 185, 129, 0.8)')
        gradient.addColorStop(0.5, 'rgba(5, 150, 105, 0.4)')
        gradient.addColorStop(1, 'rgba(16, 185, 129, 0)')
      } else {
        gradient.addColorStop(0, 'rgba(100, 116, 139, 0.5)')
        gradient.addColorStop(0.5, 'rgba(148, 163, 184, 0.2)')
        gradient.addColorStop(1, 'rgba(100, 116, 139, 0)')
      }

      ctx.beginPath()
      ctx.arc(cx, cy, radius * 1.5, 0, Math.PI * 2)
      ctx.fillStyle = gradient
      ctx.fill()

      // Inner solid core
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      if (isListening) ctx.fillStyle = '#9333ea'
      else if (isThinking) ctx.fillStyle = '#2563eb'
      else if (isSpeaking) ctx.fillStyle = '#059669'
      else ctx.fillStyle = '#64748b'
      ctx.fill()

      angle += 0.04
      animFrameRef.current = requestAnimationFrame(render)
    }

    render()

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [isOpen, isListening, isThinking, isSpeaking, audioVolume])

  // 3. Web Speech Recognition & Audio Visualizer
  const startVoiceCapture = async () => {
    try {
      // Audio Visualizer setup
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        micStreamRef.current = stream

        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
        const audioCtx = new AudioCtx()
        audioContextRef.current = audioCtx

        const analyser = audioCtx.createAnalyser()
        analyser.fftSize = 64
        analyserRef.current = analyser

        const source = audioCtx.createMediaStreamSource(stream)
        source.connect(analyser)

        const dataArray = new Uint8Array(analyser.frequencyBinCount)
        const updateVolume = () => {
          if (!analyserRef.current) return
          analyserRef.current.getByteFrequencyData(dataArray)
          let sum = 0
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i]
          }
          const avg = sum / dataArray.length
          setAudioVolume(Math.min(1, avg / 80))
          if (micStreamRef.current) {
            requestAnimationFrame(updateVolume)
          }
        }
        updateVolume()
      }

      // Speech Recognition setup (Web Speech API)
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

      if (SpeechRecognition) {
        const recognition = new SpeechRecognition()
        recognition.continuous = false
        recognition.interimResults = false
        recognition.lang = selectedLanguage === 'hi' ? 'hi-IN' : 'en-US'

        recognition.onstart = () => {
          setIsListening(true)
        }

        recognition.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript
          setIsListening(false)
          stopAudioAnalyser()
          handleSendQuery(transcript)
        }

        recognition.onerror = () => {
          setIsListening(false)
          stopAudioAnalyser()
        }

        recognition.onend = () => {
          setIsListening(false)
          stopAudioAnalyser()
        }

        recognitionRef.current = recognition
        recognition.start()
      } else {
        setIsListening(true)
      }
    } catch (err) {
      console.error('Mic access error:', err)
      setIsListening(false)
    }
  }

  const stopAudioAnalyser = () => {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop())
      micStreamRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
    setAudioVolume(0)
  }

  const stopVoiceCapture = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch {}
      recognitionRef.current = null
    }
    stopAudioAnalyser()
    setIsListening(false)
  }

  // 4. Send Query to ResQnet-AI Engine (/ai-api/chat)
  const handleSendQuery = async (queryText: string) => {
    const text = queryText.trim()
    if (!text) return

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }

    setMessages((prev) => [...prev, userMsg])
    setInputText('')
    setIsThinking(true)

    try {
      const response = await fetch('/ai-api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          language: selectedLanguage,
          location: userLocation ? `${userLocation.lat}, ${userLocation.lng}` : undefined,
        }),
      })

      if (!response.ok) {
        throw new Error(`AI Engine error: ${response.status}`)
      }

      const data = await response.json()
      const assistantText = data.response || 'Please move to safety immediately. Help is being notified.'

      const assistantMsg: Message = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: assistantText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }

      setMessages((prev) => [...prev, assistantMsg])
      setIsThinking(false)

      // Synthesize Speech & Play
      speakResponse(assistantText)
    } catch (err: any) {
      setIsThinking(false)
      const errorMsg: Message = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content:
          '⚠️ Emergency Guidance: Move to higher ground or nearest shelter immediately. If network is unstable, use the "Send via SMS" button on the dashboard.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }
      setMessages((prev) => [...prev, errorMsg])
    }
  }

  // 5. Text-to-Speech (Piper audio from backend or browser speech synthesis fallback)
  const speakResponse = async (text: string) => {
    setIsSpeaking(true)
    try {
      // Try backend TTS first
      const res = await fetch('/ai-api/audio/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, language: selectedLanguage }),
      })

      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        audioPlayerRef.current = audio

        audio.onended = () => {
          setIsSpeaking(false)
          URL.revokeObjectURL(url)
        }
        audio.onerror = () => {
          setIsSpeaking(false)
        }
        await audio.play()
        return
      }
    } catch {
      // Fallback to browser SpeechSynthesis
    }

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 1.0
      utterance.onend = () => setIsSpeaking(false)
      utterance.onerror = () => setIsSpeaking(false)
      window.speechSynthesis.speak(utterance)
    } else {
      setIsSpeaking(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-700 via-indigo-700 to-purple-800 text-white px-5 py-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-[18px]">neurology</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm tracking-tight">ResQnet Voice AI</h3>
                <span className="text-[10px] font-['JetBrains_Mono',monospace] px-1.5 py-0.5 rounded bg-white/20 uppercase font-semibold">
                  {engineReady ? 'Live 8010' : 'Engine Boot'}
                </span>
              </div>
              <p className="text-[11px] text-white/80">{engineStatus}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              className="bg-white/10 hover:bg-white/20 text-white text-xs rounded-lg px-2 py-1 border border-white/20 focus:outline-none cursor-pointer"
            >
              <option value="en" className="text-slate-900">English</option>
              <option value="hi" className="text-slate-900">हिन्दी (Hindi)</option>
              <option value="pa" className="text-slate-900">ਪੰਜਾਬੀ (Punjabi)</option>
            </select>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-white/90 transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>

        {/* Engine Starting Banner */}
        {isStartingEngine && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center justify-between text-xs text-amber-900 animate-pulse">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] animate-spin text-amber-600">sync</span>
              <span>Automatically turning on <strong>ResQnet-AI backend</strong>...</span>
            </div>
            <span className="text-[10px] font-['JetBrains_Mono',monospace] bg-amber-200 text-amber-950 px-1.5 py-0.5 rounded font-bold">
              PORT 8010
            </span>
          </div>
        )}

        {/* Voice Orb Section */}
        <div className="bg-slate-950 p-6 flex flex-col items-center justify-center relative overflow-hidden select-none">
          <canvas
            ref={canvasRef}
            width={240}
            height={160}
            className="w-[240px] h-[160px] pointer-events-none"
          />

          <div className="mt-2 flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                isListening
                  ? 'bg-purple-500 animate-ping'
                  : isThinking
                  ? 'bg-blue-500 animate-pulse'
                  : isSpeaking
                  ? 'bg-emerald-500 animate-bounce'
                  : 'bg-slate-400'
              }`}
            />
            <span className="text-xs font-semibold text-slate-300">
              {isListening
                ? 'Listening to your voice...'
                : isThinking
                ? 'Consulting Emergency Guidance AI...'
                : isSpeaking
                ? 'ResQnet Speaking...'
                : 'Tap microphone to speak'}
            </span>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              disabled={isStartingEngine}
              onClick={() => {
                if (isListening) stopVoiceCapture()
                else startVoiceCapture()
              }}
              className={`px-5 py-2.5 rounded-full text-xs font-bold transition-all flex items-center gap-2 shadow-lg ${
                isListening
                  ? 'bg-red-600 hover:bg-red-700 text-white ring-4 ring-red-500/30'
                  : 'bg-purple-600 hover:bg-purple-700 text-white ring-4 ring-purple-500/20'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">
                {isListening ? 'stop' : 'mic'}
              </span>
              <span>{isListening ? 'Stop Listening' : 'Speak Emergency'}</span>
            </button>
          </div>
        </div>

        {/* Conversation Transcript */}
        <div
          ref={chatScrollRef}
          className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50 min-h-[160px] max-h-[220px]"
        >
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-purple-700 text-white rounded-br-none'
                    : 'bg-white text-slate-800 border border-slate-200 rounded-bl-none shadow-xs'
                }`}
              >
                {m.content}
              </div>
              <span className="text-[10px] text-slate-400 mt-0.5 px-1 font-['JetBrains_Mono',monospace]">
                {m.timestamp}
              </span>
            </div>
          ))}
          {isThinking && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500 italic bg-white border border-slate-200 px-3 py-1.5 rounded-2xl w-fit">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-600 animate-ping" />
              <span>Analyzing emergency triage...</span>
            </div>
          )}
        </div>

        {/* Text Input / Quick SOS Prompts */}
        <div className="p-3 bg-white border-t border-slate-200 flex flex-col gap-2">
          {/* Quick preset chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px]">
            <button
              type="button"
              onClick={() => handleSendQuery('Water is rising rapidly inside my house. What should I do?')}
              className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 shrink-0 font-medium"
            >
              🌊 Flood Water Rising
            </button>
            <button
              type="button"
              onClick={() => handleSendQuery('Someone is bleeding and needs emergency first aid.')}
              className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 shrink-0 font-medium"
            >
              🩹 First Aid / Bleeding
            </button>
            <button
              type="button"
              onClick={() => handleSendQuery('Where is the nearest safe shelter or evacuation point?')}
              className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 shrink-0 font-medium"
            >
              📍 Nearest Shelter
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleSendQuery(inputText)
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Or type emergency message..."
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="bg-purple-700 hover:bg-purple-800 disabled:opacity-40 text-white rounded-xl px-3.5 py-2 text-xs font-bold transition-all flex items-center justify-center shrink-0"
            >
              <span className="material-symbols-outlined text-[16px]">send</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

