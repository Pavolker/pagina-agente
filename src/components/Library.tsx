import React from 'react';
import { motion } from 'motion/react';
import { Book } from '../types';

const books: Book[] = [
  {
    id: '1',
    title: 'A Estratégia da Pergunta',
    subtitle: 'Volume I • Práxis',
    description: 'Um tratado sobre a arte de interrogar a realidade e os sistemas de inteligência.',
    year: '2023',
    theme: 'Filosofia Prática',
    coverUrl: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&q=80&w=400'
  },
  {
    id: '2',
    title: 'Centauro',
    subtitle: 'A Simbiose Cognitiva',
    description: 'Como humanos e IAs co-evoluem para um novo estágio de produtividade e consciência.',
    year: '2024',
    theme: 'Inteligência Híbrida',
    coverUrl: 'https://images.unsplash.com/photo-1614850523296-d8c1af93d400?auto=format&fit=crop&q=80&w=400'
  },
  {
    id: '3',
    title: 'O Gabinete Filosófico',
    subtitle: 'Arquitetura do Pensamento',
    description: 'Uma jornada visual e textual pelos conceitos fundamentais da obra de Volker.',
    year: '2022',
    theme: 'Epistemologia',
    coverUrl: 'https://images.unsplash.com/photo-1512820790803-73c772ea978f?auto=format&fit=crop&q=80&w=400'
  }
];

export const Library: React.FC = () => {
  return (
    <section className="py-24 px-4 bg-void/20" id="biblioteca">
      <div className="max-w-4xl mx-auto mb-20 text-center">
        <h2 className="text-5xl font-serif text-ivory mb-6 italic">Biblioteca de Ideias Vivas</h2>
        <div className="w-48 h-px bg-gold/20 mx-auto" />
      </div>

      <div className="flex flex-wrap justify-center gap-12 px-4 max-w-7xl mx-auto">
        {books.map((book, i) => (
          <motion.div
            key={book.id}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.2 }}
            viewport={{ once: true }}
            className="group relative w-72 h-[420px] perspective-1000"
          >
            <div className="relative w-full h-full transition-all duration-700 transform-style-3d group-hover:rotate-y-[-10deg]">
              {/* Spine simulation */}
              <div className="absolute left-0 w-8 h-full bg-gold/20 origin-left transform-rotate-y-90 z-10 border-r border-gold/40" />
              
              {/* Cover */}
              <div className="relative w-full h-full glass-gold overflow-hidden rounded-r-lg bloom shadow-2xl">
                <img 
                  src={book.coverUrl} 
                  alt={book.title}
                  className="w-full h-full object-cover opacity-40 mix-blend-overlay group-hover:scale-110 transition-transform duration-1000"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-charcoal via-transparent to-transparent" />
                
                <div className="absolute bottom-0 left-0 right-0 p-8">
                  <span className="text-[10px] font-mono text-gold/60 uppercase tracking-widest block mb-4">
                    {book.theme} • {book.year}
                  </span>
                  <h3 className="text-2xl font-serif text-gold leading-tight mb-2">
                    {book.title}
                  </h3>
                  <p className="text-ivory/40 text-xs italic">
                    {book.subtitle}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
};
