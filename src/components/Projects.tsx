import React from 'react';
import { motion } from 'motion/react';
import { ProjectNode } from '../types';
import { ExternalLink, Database, Users, GraduationCap, Calculator, Target } from 'lucide-react';

const projects: ProjectNode[] = [
  { id: '1', name: 'ESHMIA', tagline: 'Escola de Humanidade e IA', description: 'Sistema de ensino fundamentado no novo paradigma.', type: 'educational' },
  { id: '2', name: 'IA PESSOAS', tagline: 'Analytics de Comportamento', description: 'Processamento de padrões humanos.', type: 'analytics' },
  { id: '3', name: 'EU FUTURO', tagline: 'Planejador de Evolução', description: 'Sistema de projeção de competências centauro.', type: 'experimental' },
  { id: '4', name: 'ADI', tagline: 'Algoritmo de Decisões Invertidas', description: 'Simulador de escolhas não lineares.', type: 'experimental' },
];

const icons: Record<string, any> = {
  educational: GraduationCap,
  analytics: Database,
  experimental: Target
};

export const Projects: React.FC = () => {
  return (
    <section className="py-24 px-4" id="projetos">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-end mb-16 px-4">
          <div>
            <h2 className="text-4xl font-serif text-gold mb-2">Ecossistema de Projetos</h2>
            <p className="text-ivory/40 text-sm italic">Sistemas de apoio ao pensamento humano.</p>
          </div>
          <div className="flex gap-2">
            <div className="w-2 h-2 rounded-full bg-gold" />
            <div className="w-2 h-2 rounded-full bg-gold/20" />
            <div className="w-2 h-2 rounded-full bg-gold/20" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {projects.map((project, i) => {
            const Icon = icons[project.type] || Target;
            return (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="glass-gold group p-8 rounded-xl bloom border-gold/10 hover:border-gold/40 transition-all duration-500"
              >
                <div className="flex justify-between items-start mb-6">
                  <div className="p-3 bg-gold/10 rounded-lg text-gold group-hover:scale-110 transition-transform">
                    <Icon size={24} />
                  </div>
                  <ExternalLink size={16} className="text-gold/20 group-hover:text-gold transition-colors" />
                </div>

                <h3 className="text-2xl font-serif text-ivory mb-1">{project.name}</h3>
                <h4 className="text-[10px] font-mono text-gold/60 uppercase tracking-widest mb-4">
                  {project.tagline}
                </h4>
                <p className="text-ivory/50 text-sm leading-relaxed mb-6">
                  {project.description}
                </p>

                <div className="w-full h-px bg-gradient-to-r from-gold/30 to-transparent" />
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
