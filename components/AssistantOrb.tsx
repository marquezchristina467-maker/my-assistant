
import React from 'react';

interface AssistantOrbProps {
  isActive: boolean;
  isSpeaking: boolean;
  color: string;
}

const AssistantOrb: React.FC<AssistantOrbProps> = ({ isActive, isSpeaking, color }) => {
  return (
    <div className="relative flex items-center justify-center w-64 h-64 mx-auto mb-8">
      {/* Background Glow */}
      <div className={`absolute inset-0 rounded-full blur-3xl opacity-20 transition-all duration-700 bg-gradient-to-tr ${color} ${isActive ? 'scale-150' : 'scale-100'}`} />
      
      {/* Outer Ring */}
      <div className={`absolute inset-0 rounded-full border-2 border-white/10 transition-transform duration-500 ${isSpeaking ? 'scale-110 opacity-40' : 'scale-100 opacity-20'}`} />
      
      {/* Main Orb */}
      <div className={`relative w-40 h-40 rounded-full bg-gradient-to-tr ${color} shadow-[0_0_50px_rgba(255,255,255,0.1)] flex items-center justify-center transition-all duration-500 ${isActive ? 'scale-100 shadow-xl' : 'scale-90 opacity-80'}`}>
        {/* Animated Inner Core */}
        <div className={`w-24 h-24 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center ${isSpeaking ? 'orb-pulse' : ''}`}>
           <div className={`w-12 h-12 rounded-full bg-white transition-opacity ${isActive ? 'opacity-80' : 'opacity-20'}`} />
        </div>
      </div>

      {/* Ripple Effect (Speaking) */}
      {isSpeaking && (
        <>
          <div className={`absolute w-40 h-40 rounded-full border border-white/20 animate-ping`} />
          <div className={`absolute w-40 h-40 rounded-full border border-white/10 animate-ping [animation-delay:0.5s]`} />
        </>
      )}
    </div>
  );
};

export default AssistantOrb;
