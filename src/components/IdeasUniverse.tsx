import React from 'react';
import { motion } from 'motion/react';
import { IdeaNode } from '../types';
import { Lightbulb, Fingerprint, Network, Search, Compass, Shield, Zap, RefreshCw } from 'lucide-react';

const icons: Record<string, any> = {
  lightbulb: Lightbulb,
  fingerprint: Fingerprint,
  network: Network,
  search: Search,
  compass: Compass,
  shield: Shield,
  zap: Zap,
  refresh: RefreshCw
};

const nodes: IdeaNode[] = [
  { id: '1', title: 'Filosofia do Prompt', description: 'A arte de interrogar o silêncio da IA.', icon: 'lightbulb', size: 'large' },
  { id: '2', title: 'Estratégia da Pergunta', description: 'O poder de arquitetar o desconhecido.', icon: 'search', size: 'medium' },
  { id: '3', title: 'Sistema Centauro', description: 'Simbiose estratégica entre humano e máquina.', icon: 'network', size: 'large' },
  { id: '4', title: 'Autoconhecimento Ativo', description: 'Mapeamento das camadas da consciência.', icon: 'fingerprint', size: 'medium' },
  { id: '5', title: 'Cartografia de Singularidades', description: 'Navegação em cenários imprevistos.', icon: 'compass', size: 'small' },
  { id: '6', title: 'Sistema de Interrogação', description: 'Mecanismos de extração de propósito.', icon: 'zap', size: 'small' },
];

export const IdeasUniverse: React.FC = () => {
  return (
    <section className="py-24 px-4 overflow-hidden" id="ideias">
      <div className="max-w-4xl mx-auto mb-16">
        <h2 className="text-4xl font-serif text-gold mb-4">Universo de Ideias</h2>
        <div className="w-24 h-px bg-gold/30" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {nodes.map((node, i) => {
          const Icon = icons[node.icon] || Lightbulb;
          return (
            <motion.div
              key={node.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              viewport={{ once: true }}
              whileHover={{ scale: 1.02 }}
              className={`glass p-8 rounded-xl bloom relative group cursor-pointer border-transparent hover:border-gold/30 transition-all duration-500 ${
                node.size === 'large' ? 'md:col-span-2' : ''
              }`}
            >
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-40 transition-opacity">
                <Icon size={48} className="text-gold" />
              </div>
              
              <div className="relative z-10">
                <Icon size={24} className="text-gold mb-6" />
                <h3 className="text-2xl font-serif text-ivory mb-2 group-hover:text-gold transition-colors">
                  {node.title}
                </h3>
                <p className="text-ivory/60 font-sans text-sm leading-relaxed">
                  {node.description}
                </p>
              </div>

              {/* Connecting line simulation */}
              {i % 2 === 0 && (
                <div className="hidden lg:block absolute -right-6 top-1/2 w-6 h-px bg-gold/10 group-hover:bg-gold/30 transition-colors" />
              )}
            </motion.div>
          );
        })}
      </div>
    </section>
  );
};
