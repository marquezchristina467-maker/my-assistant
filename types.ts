
export type PersonaType = 'assistant' | 'academic' | 'coder' | 'hacker' | 'manager' | 'travel' | 'nerd' | 'streetwise' | 'finance' | 'boy' | 'legal';

export interface PersonaConfig {
  id: PersonaType;
  name: string;
  description: string;
  systemInstruction: string;
  color: string;
  icon: string;
  imageUrl?: string;
}

export interface MessagePart {
  text?: string;
}
