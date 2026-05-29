import React from 'react';
import { motion } from 'motion/react';
import { TimelineEvent } from '../types';

const events: TimelineEvent[] = [
  { year: '1995', title: 'O Nascimento da Pergunta', description: 'Início das investigações sobre ontologia e linguagem.', phase: 'Gênese' },
  { year: '2005', title: 'Fundação do Scriptorium', description: 'Espaço físico para pesquisa multidisciplinar.', phase: 'Maturação' },
  { year: '2015', title: 'A Revolução Centauro', description: 'Primeiros protótipos de integração cognitiva.', phase: 'Expansão' },
  { year: '2024', title: 'Sincronização Terminal', description: 'O Gabinete Filosófico torna-se digital.', phase: 'Convergência' },
];

export const Timeline: React.FC = () => {
  return (
    <section className="py-32 px-4 relative" id="timeline">
      <div className="absolute top-0 bottom-0 left-1/2 w-px bg-gold/10 hidden md:block" />
      
      <div className="max-w-5xl mx-auto space-y-24 relative">
        <h2 className="text-4xl font-serif text-gold text-center mb-16">Linha do Tempo Intelectual</h2>
        
        {events.map((event, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: i % 2 === 0 ? -50 : 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 1 }}
            viewport={{ once: true }}
            className={`flex flex-col md:flex-row items-center gap-8 ${
              i % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse text-right'
            }`}
          >
            <div className="flex-1">
              <span className="text-6xl font-serif text-gold/30 block mb-4">{event.year}</span>
              <h3 className="text-3xl font-serif text-gold mb-3">{event.title}</h3>
              <p className="text-ivory/50 font-sans leading-relaxed max-w-md mx-auto md:mx-0">
                {event.description}
              </p>
            </div>
            
            <div className="w-4 h-4 rounded-full bg-gold bloom relative z-10 shrink-0">
              <div className="absolute inset-0 animate-ping rounded-full bg-gold/30" />
            </div>
            
            <div className="flex-1 opacity-20 hidden md:block">
               <span className="text-xs uppercase tracking-[0.5em] font-mono text-gold">{event.phase}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
};
