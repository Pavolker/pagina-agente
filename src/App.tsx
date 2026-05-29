import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Menu, X, Terminal as TerminalIcon, Book, Network, History, Briefcase, Quote, ChevronUp } from 'lucide-react';
import { Terminal } from './components/Terminal';
import { Hero } from './components/Hero';
import { IdeasUniverse } from './components/IdeasUniverse';
import { Library } from './components/Library';
import { Timeline } from './components/Timeline';
import { Projects } from './components/Projects';
import { Aphorisms } from './components/Aphorisms';
import { NeuralBackground } from './components/NeuralBackground';

export default function App() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const sections = [
    { id: 'identidade', icon: <ChevronUp size={18} />, label: 'Início' },
    { id: 'ideias', icon: <Network size={18} />, label: 'Ideias' },
    { id: 'biblioteca', icon: <Book size={18} />, label: 'Biblioteca' },
    { id: 'timeline', icon: <History size={18} />, label: 'Trajetória' },
    { id: 'projetos', icon: <Briefcase size={18} />, label: 'Projetos' },
  ];

  return (
    <div className="relative min-h-screen font-sans selection:bg-gold/30 scroll-smooth">
      <NeuralBackground />

      {/* Main Layout */}
      <div className="flex flex-col md:flex-row min-h-screen">
        
        {/* LEFT COLUMN: 30% - Fixed AI Terminal on Desktop */}
        <aside className="w-full md:w-[30%] lg:w-[25%] md:fixed md:top-0 md:left-0 md:h-screen z-50 p-4 lg:p-6 bg-charcoal/50 backdrop-blur-md border-r border-gold/5">
          <div className="flex flex-col h-full gap-4">
            <div className="flex items-center justify-between mb-2">
              <h1 className="text-xl font-serif text-ivory tracking-widest uppercase">Gabinete</h1>
              <div className="md:hidden">
                <button 
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="p-2 text-gold hover:bg-gold/10 rounded-lg transition-colors"
                >
                  {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                </button>
              </div>
            </div>
            
            <div className="flex-1">
              <Terminal />
            </div>

            <footer className="text-[10px] text-ivory/20 font-mono tracking-tighter flex justify-between mt-4">
              <span>© 2024 PAULO VOLKER</span>
              <span className="animate-pulse">SYSTEM ONLINE</span>
            </footer>
          </div>
        </aside>

        {/* RIGHT COLUMN: 70% - Scrollable Content */}
        <main className="flex-1 md:ml-[30%] lg:ml-[25%] relative z-10">
          <div className="max-w-6xl mx-auto">
            <div id="identidade">
              <Hero />
            </div>
            
            <div className="space-y-32 pb-32">
              <div id="ideias">
                <IdeasUniverse />
              </div>
              <div id="biblioteca">
                <Library />
              </div>
              <div id="timeline">
                <Timeline />
              </div>
              <div id="projetos">
                <Projects />
              </div>
              <div id="aforismos">
                <Aphorisms />
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Bottom Floating Navigation (Mobile & Utility) */}
      <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 glass rounded-full px-6 py-3 z-[60] bloom border-gold/10 hidden md:flex items-center justify-center gap-10">
        {sections.map(section => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className="text-ivory/30 hover:text-gold transition-all duration-300 transform hover:scale-110 group relative"
          >
            {section.icon}
            <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-charcoal border border-gold/20 text-[10px] text-gold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
              {section.label}
            </span>
          </a>
        ))}
      </nav>

      {/* Mobile Navigation Drawer */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            className="fixed inset-0 z-[100] bg-charcoal/95 backdrop-blur-2xl md:hidden"
          >
            <div className="p-8">
              <button 
                onClick={() => setMobileMenuOpen(false)}
                className="absolute top-8 right-8 text-gold"
              >
                <X size={32} />
              </button>
              
              <div className="flex flex-col gap-8 mt-20">
                {sections.map((section, i) => (
                  <motion.a
                    key={section.id}
                    href={`#${section.id}`}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    onClick={() => setMobileMenuOpen(false)}
                    className="text-4xl font-serif text-ivory hover:text-gold transition-colors flex items-center gap-4"
                  >
                    <span className="text-gold/20">{section.id === 'identidade' ? '01' : `0${i + 1}`}</span>
                    {section.label}
                  </motion.a>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
