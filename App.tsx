
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { PersonaConfig } from './types';
import { PERSONAS } from './constants';
import { decodeBase64, decodeAudioData, createAudioBlob } from './services/audioUtils';
import AssistantFace from './components/AssistantFace';

// Create contexts lazily or ensure they are resumed on gesture
let inputCtx: AudioContext | null = null;
let outputCtx: AudioContext | null = null;

const App: React.FC = () => {
  const [selectedPersona, setSelectedPersona] = useState<PersonaConfig>(PERSONAS[0]);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [latestText, setLatestText] = useState<string>('');
  const [documents, setDocuments] = useState<{ id: string, title: string, content: string, timestamp: number }[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [websiteConfig, setWebsiteConfig] = useState<WebsiteConfig>(defaultWebsiteConfig);
  const [error, setError] = useState<string | null>(null);
  const [memory, setMemory] = useState<{ role: 'user' | 'model', timestamp: number, text: string }[]>(() => {
    try {
      const stored = localStorage.getItem('nexus_memory');
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  });
  const [keepAwake, setKeepAwake] = useState(false);

  // Refs for session management
  const sessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const micStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const modelTurnBufferRef = useRef<string>('');
  const wakeLockRef = useRef<any>(null);

  useEffect(() => {
    const requestWakeLock = async () => {
      try {
        if (keepAwake && 'wakeLock' in navigator) {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        } else if (!keepAwake && wakeLockRef.current) {
          await wakeLockRef.current.release();
          wakeLockRef.current = null;
        }
      } catch (err) {
        console.error('WakeLock error:', err);
      }
    };
    
    requestWakeLock();
    
    const handleVisibilityChange = () => {
      if (keepAwake && document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [keepAwake]);

  useEffect(() => {
    localStorage.setItem('nexus_memory', JSON.stringify(memory.slice(-50)));
  }, [memory]);

  const stopSession = useCallback(() => {
    // 1. Close session
    if (sessionRef.current) {
      try { sessionRef.current.close?.(); } catch (e) {}
      sessionRef.current = null;
    }

    // 2. Stop audio processing
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current.onaudioprocess = null;
      scriptProcessorRef.current = null;
    }
    if (inputSourceRef.current) {
      inputSourceRef.current.disconnect();
      inputSourceRef.current = null;
    }

    // 3. Stop microphone
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
    }

    // 4. Stop all current playing sounds
    sourcesRef.current.forEach(source => {
      try { source.stop(); } catch(e) {}
    });
    sourcesRef.current.clear();
    nextStartTimeRef.current = 0;

    setIsSessionActive(false);
    setIsSpeaking(false);
    setIsConnecting(false);
  }, []);

  const handleMessage = useCallback(async (message: LiveServerMessage) => {
    // Audio Processing
    const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (audioData && outputCtx) {
      setIsSpeaking(true);
      const audioBytes = decodeBase64(audioData);
      const audioBuffer = await decodeAudioData(audioBytes, outputCtx, 24000, 1);
      
      const source = outputCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(outputCtx.destination);
      
      const startTime = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
      source.start(startTime);
      nextStartTimeRef.current = startTime + audioBuffer.duration;
      
      sourcesRef.current.add(source);
      source.onended = () => {
        sourcesRef.current.delete(source);
        if (sourcesRef.current.size === 0) {
          setIsSpeaking(false);
        }
      };
    }

    // Text Processing (for lists, forms, etc.)
    const textPart = message.serverContent?.modelTurn?.parts?.find(p => p.text)?.text;
    if (textPart) {
      setLatestText(prev => prev + textPart + "\n");
    }

    // Capture model's speech as text for copying/printing and memory
    if (message.serverContent?.outputTranscription) {
      const t = message.serverContent.outputTranscription.text;
      setLatestText(prev => prev + t);
      modelTurnBufferRef.current += t;
    }

    if (message.serverContent?.turnComplete) {
      if (modelTurnBufferRef.current.trim()) {
        let text = modelTurnBufferRef.current.trim();
        
        // Extract Website Config
        const webConfigRegex = /\[\[WEB_CONFIG\]\](.*?)\[\[\/WEB_CONFIG\]\]/s;
        const match = text.match(webConfigRegex);
        if (match) {
          try {
            const config = JSON.parse(match[1]);
            setWebsiteConfig(prev => ({ ...prev, ...config }));
          } catch (e) {
            console.error("Failed to parse web config", e);
          }
          text = text.replace(webConfigRegex, '');
        }

        if (text.trim()) {
          setMemory(prev => [...prev, { role: 'model', timestamp: Date.now(), text }]);
        }
        modelTurnBufferRef.current = '';
      }

      setLatestText(prevText => {
        let strippedText = prevText.replace(/\[\[WEB_CONFIG\]\].*?\[\[\/WEB_CONFIG\]\]/gs, '');
        if (strippedText.trim()) {
          const newDoc = {
            id: Date.now().toString(),
            title: `Generated ${new Date().toLocaleTimeString()}`,
            content: strippedText,
            timestamp: Date.now()
          };
          setDocuments(prev => [newDoc, ...prev]);
          setActiveDocId(newDoc.id);
        }
        return '';
      });
    }

    // Interruption Handling
    if (message.serverContent?.interrupted) {
      sourcesRef.current.forEach(source => {
        try { source.stop(); } catch(e) {}
      });
      sourcesRef.current.clear();
      nextStartTimeRef.current = 0;
      setIsSpeaking(false);
    }
  }, []);

  const startSession = async () => {
    if (isConnecting) return;
    setIsConnecting(true);
    setError(null);

    try {
      // Initialize Audio Contexts on user gesture
      if (!inputCtx) inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      if (!outputCtx) outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

      if (inputCtx.state === 'suspended') await inputCtx.resume();
      if (outputCtx.state === 'suspended') await outputCtx.resume();

      // Ensure fresh API client
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      const memoryContext = memory.length > 0 
        ? `\n\n--- PAST CONVERSATION MEMORY ---\nYou have persistent memory of past interactions with Christina. Here is a log of recent interactions:\n${memory.slice(-20).map(m => `[${new Date(m.timestamp).toLocaleTimeString()}] ${m.role === 'user' ? 'Christina' : 'You'}: ${m.text}`).join('\n')}\n\nUse this context seamlessly, as if you never forgot anything.` 
        : '';

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: selectedPersona.systemInstruction + memoryContext,
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } }
          },
          outputAudioTranscription: {}
        },
        callbacks: {
          onopen: () => {
            if (!inputCtx || !micStreamRef.current) return;
            
            const source = inputCtx.createMediaStreamSource(micStreamRef.current);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            
            inputSourceRef.current = source;
            scriptProcessorRef.current = scriptProcessor;

            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const blob = createAudioBlob(inputData);
              sessionPromise.then(session => {
                if (session && sessionRef.current) {
                  session.sendRealtimeInput({ media: blob });
                }
              });
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
            
            setIsSessionActive(true);
            setIsConnecting(false);
          },
          onmessage: handleMessage,
          onerror: (e) => {
            console.error('Session Error:', e);
            setError('Connection interrupted. Retrying...');
            stopSession();
          },
          onclose: () => {
            stopSession();
          }
        }
      });

      sessionRef.current = await sessionPromise;
    } catch (err) {
      console.error('Failed to start session:', err);
      setError('Connection failed. Please check your mic permissions.');
      stopSession();
    }
  };

  const toggleSession = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (isConnecting) return;
    
    if (isSessionActive) {
      stopSession();
    } else {
      setLatestText('');
      await startSession();
    }
  };

  useEffect(() => {
    return () => stopSession();
  }, [stopSession]);

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#0f172a] text-slate-100 p-4 md:p-8 gap-6 overflow-hidden">
      {/* Sidebar - Persona Selection */}
      <aside className="w-full md:w-80 flex flex-col gap-4 overflow-y-auto max-h-[35vh] md:max-h-full glass rounded-3xl p-6 shrink-0">
        <div className="mb-4">
          <h1 className="text-2xl font-bold gradient-text">Nexus AI</h1>
          <p className="text-xs text-slate-400 mt-1">Specialized AI Core</p>
        </div>
        
        <div className="space-y-3">
          {PERSONAS.map((p) => (
            <button
              key={p.id}
              disabled={isConnecting}
              onClick={() => {
                if (isSessionActive) stopSession();
                setSelectedPersona(p);
              }}
              className={`w-full text-left p-4 rounded-2xl border transition-all duration-300 flex items-center gap-4 ${
                selectedPersona.id === p.id
                  ? `bg-slate-700/50 border-white/20 shadow-lg scale-[1.02]`
                  : 'bg-transparent border-transparent hover:bg-white/5 opacity-60 hover:opacity-100'
              } ${isConnecting ? 'cursor-wait' : 'cursor-pointer'}`}
            >
              <span className="text-2xl">{p.icon}</span>
              <div>
                <h3 className="font-semibold text-sm">{p.name}</h3>
                <p className="text-[11px] text-slate-400 line-clamp-1">{p.description}</p>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-auto pt-6 border-t border-white/5 space-y-3">
          <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono uppercase tracking-widest">
            <span className={`w-2 h-2 rounded-full ${isSessionActive ? 'bg-emerald-500 animate-pulse' : isConnecting ? 'bg-amber-500 animate-bounce' : 'bg-slate-600'}`}></span>
            {isConnecting ? 'Connecting...' : isSessionActive ? 'Session Active' : 'Ready'}
          </div>
          <button
            onClick={() => {
              if (window.confirm('Clear all persistent memory and reset the assistant?')) {
                setMemory([]);
                localStorage.removeItem('nexus_memory');
              }
            }}
            className="w-full text-[10px] uppercase font-bold tracking-wider text-slate-400 hover:text-red-400 bg-white/5 hover:bg-red-500/10 p-2 rounded-lg border border-transparent hover:border-red-500/20 transition-all"
          >
            Clear Memory
          </button>
          
          <label className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/10 mt-2 cursor-pointer hover:bg-white/10 transition-all group">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-300">Keep App Awake</span>
            <input
              type="checkbox"
              className="sr-only peer"
              checked={keepAwake}
              onChange={(e) => setKeepAwake(e.target.checked)}
            />
            <div className="w-7 h-4 bg-slate-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-500 relative shrink-0"></div>
          </label>
        </div>
      </aside>

      {/* Main Experience Area */}
      <main className="flex-1 flex flex-col glass rounded-3xl overflow-hidden relative min-w-0">
        <div className="p-4 md:p-6 border-b border-white/5 flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <span className="opacity-70">{selectedPersona.icon}</span>
              {selectedPersona.name}
            </h2>
          </div>
          {error && (
            <div className="bg-red-500/10 text-red-400 text-[10px] md:text-xs px-3 py-1 rounded-full border border-red-500/20 max-w-[200px] truncate animate-pulse">
              {error}
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col p-4 md:p-6 min-h-0 overflow-hidden">
          <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0 overflow-hidden">
            {/* Assistant View */}
            <div className="flex-1 flex flex-col items-center justify-center bg-slate-900/40 rounded-3xl border border-white/5 p-4 md:p-8 overflow-hidden relative">
              <div className="w-full max-w-sm flex flex-col items-center">
                <AssistantFace 
                  isActive={isSessionActive} 
                  isSpeaking={isSpeaking} 
                  color={selectedPersona.color} 
                  imageUrl={selectedPersona.imageUrl}
                />
                <div className="text-center space-y-2 relative z-10 mt-4">
                  <p className={`text-lg md:text-xl font-medium transition-opacity ${isSessionActive || isConnecting ? 'opacity-100' : 'opacity-40'}`}>
                    {isConnecting ? "Initializing Core..." : isSpeaking ? "Nexus responding..." : isSessionActive ? "Listening..." : "Nexus Offline"}
                  </p>
                  <p className="text-xs text-slate-500 max-w-[200px] mx-auto">
                    {isConnecting ? "Establishing neural link..." : isSessionActive ? "Speak clearly." : "Engage the system below."}
                  </p>
                </div>
              </div>
            </div>

            {selectedPersona.id === 'coder' ? (
              <div className="flex-1 flex flex-col bg-slate-900/80 rounded-3xl border-2 border-emerald-500/20 min-h-0 overflow-hidden shadow-2xl relative z-10">
                <div className="flex items-center justify-between mb-0 border-b border-emerald-500/10 p-3 shrink-0 bg-slate-800">
                  <div className="flex flex-col">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-emerald-400">Web Canvas</h3>
                    <p className="text-[9px] text-slate-400">Live Website Builder</p>
                  </div>
                </div>
                <div className="flex-1 overflow-hidden">
                  <WebsiteBuilder config={websiteConfig} onChange={setWebsiteConfig} />
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col bg-slate-900/80 rounded-3xl border-2 border-blue-500/20 p-4 md:p-6 min-h-0 overflow-hidden relative z-10 shadow-2xl">
                <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-3 shrink-0">
                  <div className="flex flex-col">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-blue-400">Document Vault</h3>
                    <p className="text-[10px] text-slate-400">Generated forms, lists, and info</p>
                  </div>
                  <div className="flex gap-2">
                    {activeDocId && (
                      <button 
                        onClick={() => {
                          const doc = documents.find(d => d.id === activeDocId);
                          if (doc) {
                            navigator.clipboard.writeText(doc.content);
                            alert('Document copied!');
                          }
                        }} 
                        className="flex items-center gap-2 text-[10px] bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg font-bold uppercase transition-all shadow-lg active:scale-95"
                      >
                        Copy
                      </button>
                    )}
                    <button 
                      onClick={() => {
                        setDocuments([]);
                        setActiveDocId(null);
                        setLatestText('');
                      }} 
                      className="text-[10px] bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 px-3 py-1.5 rounded-lg font-bold uppercase transition-all border border-white/5"
                    >
                      Clear All
                    </button>
                  </div>
                </div>

                <div className="flex-1 flex flex-col min-h-0 gap-4">
                  {/* Document List (Horizontal Tabs) */}
                  {documents.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar shrink-0">
                      {documents.map(doc => (
                        <button
                          key={doc.id}
                          onClick={() => setActiveDocId(doc.id)}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase whitespace-nowrap transition-all border ${
                            activeDocId === doc.id 
                              ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' 
                              : 'bg-white/5 border-white/5 text-slate-500 hover:text-slate-300'
                          }`}
                        >
                          {doc.title}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Active Document Content */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar bg-black/40 rounded-2xl p-5 border border-white/5 shadow-inner relative">
                    {latestText && (
                      <div className="absolute top-4 right-4 flex items-center gap-2">
                        <span className="flex h-2 w-2 relative">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                        </span>
                        <span className="text-[9px] text-amber-500 font-bold uppercase">Generating...</span>
                      </div>
                    )}
                    
                    <pre className="text-sm font-mono whitespace-pre-wrap leading-relaxed text-slate-100 selection:bg-blue-500/50">
                      {latestText || (activeDocId ? documents.find(d => d.id === activeDocId)?.content : "Ask the assistant to generate a form, list, or document. It will appear here automatically.")}
                    </pre>
                  </div>

                  {activeDocId && (
                    <div className="pt-4 border-t border-white/10 flex justify-between items-center shrink-0">
                      <div className="flex items-center gap-2">
                        <span className="flex h-2 w-2 relative">
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                        <p className="text-[10px] text-slate-400 font-medium">Document Ready</p>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => {
                            const doc = documents.find(d => d.id === activeDocId);
                            if (doc) {
                              const blob = new Blob([doc.content], { type: 'text/markdown' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `Nexus_Document_${doc.title.replace(/[^a-z0-9]/gi, '_')}.md`;
                              document.body.appendChild(a);
                              a.click();
                              document.body.removeChild(a);
                              URL.revokeObjectURL(url);
                            }
                          }}
                          className="flex items-center gap-2 text-[10px] bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold uppercase hover:bg-blue-500 transition-all shadow-lg active:scale-95"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                          Download
                        </button>
                        <button 
                          onClick={() => window.print()} 
                          className="flex items-center gap-2 text-[10px] bg-white text-slate-900 px-5 py-2.5 rounded-xl font-bold uppercase hover:bg-slate-200 transition-all shadow-[0_0_20px_rgba(255,255,255,0.2)] active:scale-95"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                          Print Active
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-6 md:p-8 border-t border-white/5 bg-slate-800/20 backdrop-blur-md shrink-0 z-50">
          <div className="max-w-xs mx-auto">
            <button
              onClick={toggleSession}
              disabled={isConnecting}
              className={`w-full relative flex items-center justify-center gap-3 p-5 rounded-2xl font-bold transition-all duration-300 shadow-2xl touch-manipulation active:scale-95 ${
                isConnecting ? 'bg-slate-800 text-slate-500 cursor-not-allowed' :
                isSessionActive
                  ? 'bg-slate-700 hover:bg-red-900/40 border border-slate-600 text-white'
                  : 'bg-white hover:bg-slate-100 text-[#0f172a]'
              }`}
            >
              {!isConnecting && (
                <div className={`absolute inset-0 bg-gradient-to-tr ${selectedPersona.color} opacity-0 hover:opacity-10 transition-opacity rounded-2xl`} />
              )}
              
              {isConnecting ? (
                <div className="w-5 h-5 border-2 border-slate-500 border-t-white rounded-full animate-spin"></div>
              ) : isSessionActive ? (
                <>
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                  <span>TERMINATE LINK</span>
                </>
              ) : (
                <>
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
                  <span>CONNECT NEXUS</span>
                </>
              )}
            </button>
          </div>
          <div className="mt-6 text-center text-[9px] text-slate-600 uppercase tracking-widest space-y-2">
            <p className="font-bold text-slate-400">© {new Date().getFullYear()} Nexus AI. All rights reserved.</p>
            <div className="bg-red-500/5 p-3 rounded-lg border border-red-500/10">
              <p className="text-red-400 font-bold mb-1">COPYRIGHT WARNING</p>
              <p className="normal-case italic text-[10px] text-slate-500 leading-relaxed max-w-md mx-auto">
                Anyone who copies or uses this platform without prior written knowledge or permission will be forced to cease immediately or otherwise be fined under international intellectual property law.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
