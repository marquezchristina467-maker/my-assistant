
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
  const [error, setError] = useState<string | null>(null);

  // Refs for session management
  const sessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const micStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

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

    // Capture model's speech as text for copying/printing
    if (message.serverContent?.outputTranscription) {
      setLatestText(prev => prev + message.serverContent.outputTranscription.text);
    }

    if (message.serverContent?.turnComplete) {
      // We keep the text for the user to copy/print
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

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: selectedPersona.systemInstruction,
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

        <div className="mt-auto pt-6 border-t border-white/5">
          <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono uppercase tracking-widest">
            <span className={`w-2 h-2 rounded-full ${isSessionActive ? 'bg-emerald-500 animate-pulse' : isConnecting ? 'bg-amber-500 animate-bounce' : 'bg-slate-600'}`}></span>
            {isConnecting ? 'Connecting...' : isSessionActive ? 'Session Active' : 'Ready'}
          </div>
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
            <div className="flex-1 flex flex-col items-center justify-center bg-slate-900/40 rounded-3xl border border-white/5 p-4 md:p-8 overflow-hidden relative">
              <div className="w-full max-w-sm flex flex-col items-center">
                <AssistantFace 
                  isActive={isSessionActive} 
                  isSpeaking={isSpeaking} 
                  color={selectedPersona.color} 
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

            {/* Structured Output Area (for lists/forms) */}
            <div className={`flex-1 flex flex-col bg-slate-900/80 rounded-3xl border-2 border-blue-500/30 p-4 md:p-6 min-h-0 overflow-hidden transition-all duration-500 ${latestText ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4 pointer-events-none'}`}>
              <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-3 shrink-0">
                <div className="flex flex-col">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-blue-400">Document Output</h3>
                  <p className="text-[10px] text-slate-400">Copy or print your generated content</p>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      if (!latestText) return;
                      navigator.clipboard.writeText(latestText);
                      alert('Text copied to clipboard!');
                    }} 
                    className="flex items-center gap-2 text-[10px] bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg font-bold uppercase transition-all shadow-lg active:scale-95"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path></svg>
                    Copy Text
                  </button>
                  <button 
                    onClick={() => setLatestText('')} 
                    className="text-[10px] bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 px-3 py-1.5 rounded-lg font-bold uppercase transition-all border border-white/5"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 bg-black/40 rounded-2xl p-5 border border-white/5 shadow-inner">
                <pre className="text-sm font-mono whitespace-pre-wrap leading-relaxed text-slate-100 selection:bg-blue-500/50">
                  {latestText || "Waiting for Task Boy to speak..."}
                </pre>
              </div>
              <div className="mt-4 pt-4 border-t border-white/10 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                  </span>
                  <p className="text-[10px] text-slate-400 font-medium">Ready for printing</p>
                </div>
                <button 
                  onClick={() => {
                    if (!latestText) return;
                    window.print();
                  }} 
                  className="flex items-center gap-2 text-[10px] bg-white text-slate-900 px-5 py-2.5 rounded-xl font-bold uppercase hover:bg-slate-200 transition-all shadow-[0_0_20px_rgba(255,255,255,0.2)] active:scale-95"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                  Print Document
                </button>
              </div>
            </div>
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
        </div>
      </main>
    </div>
  );
};

export default App;
