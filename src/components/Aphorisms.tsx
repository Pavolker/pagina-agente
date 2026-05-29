import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Quote } from 'lucide-react';

const aphorisms = [
  "A resposta é apenas o repouso da pergunta; a sabedoria habita no movimento.",
  "O Sistema Centauro não é sobre potência, é sobre sintonia.",
  "Humanidade e IA não são rivais, são as duas mãos do mesmo arquiteto.",
  "Não interrogue o silêncio para obter dados, mas para encontrar sentidos.",
  "O autoconhecimento ativo é o único firewall contra a obsolescência."
];

export const Aphorisms: React.FC = () => {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex(prev => (prev + 1) % aphorisms.length);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="py-32 px-4 flex flex-col items-center justify-center text-center overflow-hidden">
      <Quote size={48} className="text-gold/20 mb-12" />
      
      <div className="max-w-3xl min-h-[160px] flex items-center justify-center">
        <AnimatePresence mode="wait">
          <motion.p
            key={index}
            initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -20, filter: 'blur(10px)' }}
            transition={{ duration: 1.5, ease: 'easeInOut' }}
            className="text-3xl md:text-5xl font-serif text-ivory/90 italic leading-snug"
          >
            "{aphorisms[index]}"
          </motion.p>
        </AnimatePresence>
      </div>

      <div className="flex gap-4 mt-16">
        {aphorisms.map((_, i) => (
          <button
            key={i}
            onClick={() => setIndex(i)}
            className={`w-1.5 h-1.5 rounded-full transition-all duration-500 ${
              i === index ? 'bg-gold w-8' : 'bg-gold/20'
            }`}
          />
        ))}
      </div>
    </section>
  );
};
