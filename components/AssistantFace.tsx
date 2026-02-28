
import React, { useEffect, useState } from 'react';

interface AssistantFaceProps {
  isActive: boolean;
  isSpeaking: boolean;
  color: string;
}

const AssistantFace: React.FC<AssistantFaceProps> = ({ isActive, isSpeaking, color }) => {
  const [blink, setBlink] = useState(false);

  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 150);
    }, 4000 + Math.random() * 3000);

    return () => clearInterval(blinkInterval);
  }, []);

  const glowColor = color.includes('blue') ? '#60a5fa' : 
                    color.includes('purple') ? '#a78bfa' : 
                    color.includes('emerald') ? '#10b981' : 
                    color.includes('red') ? '#f87171' : 
                    '#fbbf24';

  return (
    <div className="relative flex items-center justify-center w-full max-w-[280px] aspect-[1/1.1] mx-auto">
      {/* Background Glow Aura */}
      <div className={`absolute inset-0 rounded-full blur-[60px] md:blur-[80px] opacity-20 transition-all duration-1000 bg-gradient-to-tr ${color} ${isActive ? 'scale-125' : 'scale-75 opacity-10'}`} />

      {/* The Face Container */}
      <div className={`relative w-full h-full flex items-center justify-center transition-transform duration-700 ${isActive ? 'scale-100' : 'scale-90 grayscale-[0.5] opacity-60'}`}>
        <svg viewBox="0 0 200 240" className="w-full h-full drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]">
          <defs>
            <linearGradient id="faceGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.15)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
            </linearGradient>
          </defs>

          {/* Main Head Structure */}
          <path 
            d="M100,20 C140,20 170,50 175,100 C180,160 150,220 100,220 C50,220 20,160 25,100 C30,50 60,20 100,20 Z" 
            fill="url(#faceGradient)" 
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="1"
          />

          {/* Facial Tech Lines */}
          <path d="M60,35 Q100,30 140,35" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="2" />
          <path d="M40,140 Q100,160 160,140" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
          
          {/* Eyes */}
          <g>
            {/* Left Eye */}
            <ellipse cx="65" cy="100" rx="18" ry={blink ? 0.5 : 10} fill="#1e293b" />
            {!blink && (
              <>
                <circle cx="65" cy="100" r="6" fill={glowColor} className="opacity-80">
                  <animate attributeName="r" values="5;7;5" dur="3s" repeatCount="indefinite" />
                </circle>
                <circle cx="65" cy="100" r="2" fill="white" className="opacity-90" />
              </>
            )}

            {/* Right Eye */}
            <ellipse cx="135" cy="100" rx="18" ry={blink ? 0.5 : 10} fill="#1e293b" />
            {!blink && (
              <>
                <circle cx="135" cy="100" r="6" fill={glowColor} className="opacity-80">
                  <animate attributeName="r" values="5;7;5" dur="3s" repeatCount="indefinite" />
                </circle>
                <circle cx="135" cy="100" r="2" fill="white" className="opacity-90" />
              </>
            )}
          </g>

          {/* Mouth / Voice Reactivity */}
          <g transform="translate(100, 180)">
            {isSpeaking ? (
              <g>
                {[...Array(5)].map((_, i) => (
                  <rect
                    key={i}
                    x={-20 + i * 10}
                    y="-5"
                    width="4"
                    height="10"
                    rx="2"
                    fill={glowColor}
                  >
                    <animate attributeName="height" values="2;15;2;10;2" dur={`${0.4 + i * 0.1}s`} repeatCount="indefinite" />
                    <animate attributeName="y" values="-1;-7;-1;-5;-1" dur={`${0.4 + i * 0.1}s`} repeatCount="indefinite" />
                  </rect>
                ))}
              </g>
            ) : (
              <rect x="-15" y="-1" width="30" height="2" rx="1" fill="rgba(255,255,255,0.2)" />
            )}
          </g>

          {/* Chin Detail */}
          <path d="M85,210 Q100,215 115,210" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="2" />
        </svg>

        {/* Floating Particles */}
        {isActive && (
          <div className="absolute inset-0 pointer-events-none">
            {[...Array(6)].map((_, i) => (
              <div 
                key={i}
                className="absolute w-1 h-1 bg-white rounded-full opacity-40 animate-pulse"
                style={{
                  top: `${20 + Math.random() * 60}%`,
                  left: `${10 + Math.random() * 80}%`,
                  animationDelay: `${i * 0.5}s`,
                  boxShadow: `0 0 10px ${glowColor}`
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AssistantFace;
