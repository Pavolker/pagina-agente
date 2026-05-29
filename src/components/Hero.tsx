import React from 'react';
import { motion } from 'motion/react';

export const Hero: React.FC = () => {
  return (
    <section className="min-h-[80vh] flex flex-col items-center justify-center text-center px-4 relative">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.5 }}
        className="absolute -z-10 w-[500px] h-[500px] bg-gold/5 blur-[120px] rounded-full"
      />
      
      <motion.h1 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 1 }}
        className="text-7xl md:text-9xl font-serif text-ivory tracking-tighter mb-6"
      >
        PAULO VOLKER
      </motion.h1>
      
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 1 }}
        className="flex flex-col items-center"
      >
        <p className="text-xl md:text-2xl font-serif italic text-gold max-w-2xl leading-relaxed mb-8">
          Filósofo • Escritor • Pesquisador • Desenvolvedor de Sistemas Cognitivos
        </p>
        
        <div className="flex gap-12 text-gold/40 text-[10px] uppercase tracking-[0.3em] font-mono">
          <span className="flex items-center gap-2">
            <div className="w-1 h-1 rounded-full bg-gold animate-pulse" />
            Tradição
          </span>
          <span className="flex items-center gap-2">
            <div className="w-1 h-1 rounded-full bg-gold animate-pulse" />
            Escrita
          </span>
          <span className="flex items-center gap-2">
            <div className="w-1 h-1 rounded-full bg-gold animate-pulse" />
            Algoritmo
          </span>
        </div>
      </motion.div>
    </section>
  );
};
