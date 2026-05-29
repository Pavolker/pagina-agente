export interface Book {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  year: string;
  theme: string;
  coverUrl: string;
}

export interface IdeaNode {
  id: string;
  title: string;
  description: string;
  icon: string;
  size: 'small' | 'medium' | 'large';
}

export interface ProjectNode {
  id: string;
  name: string;
  tagline: string;
  description: string;
  type: 'educational' | 'analytics' | 'experimental';
  url?: string;
}

export interface TimelineEvent {
  year: string;
  title: string;
  description: string;
  phase: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}
