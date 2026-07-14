'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import Providers from '@/components/Providers';

const agents = [
  {
    id: 'collections',
    icon: 'coins',
    title: 'Collections Agent',
    subtitle: 'Système de recouvrement intelligent',
    description: 'Gestion automatisée des créances, relances par email et Telegram, suivi des paiements.',
    href: '/dashboard',
    color: '#C5A03D',
    features: ['Relances automatiques', 'Suivi des paiements', 'Templates personnalisés'],
  },
  {
    id: 'billing',
    icon: 'receipt',
    title: 'Billing Agent',
    subtitle: 'Système de facturation intelligent',
    description: 'Création de factures professionnelles, analyse AI de documents, envoi automatisé.',
    href: '/billing/dashboard',
    color: '#3498DB',
    features: ['Génération PDF', 'Analyse AI', 'Envoi par email'],
  },
];

function SelectAgentContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  const handleSelect = (agent: typeof agents[0]) => {
    setSelectedAgent(agent.id);
    setTimeout(() => {
      router.push(agent.href);
    }, 400);
  };

  if (status === 'loading') {
    return (
      <div className="page-loading" style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #2A2A2A 0%, #3A3A3A 50%, #4A4A4A 100%)' }}>
        <div className="spinner"></div>
        <p className="page-loading-text" style={{ color: '#fff' }}>Chargement...</p>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="select-agent-page">
      <div className="select-agent-container">
        <div className="select-agent-header">
          <Image src="/logo.png" alt="FPA" width={180} height={44} className="select-agent-logo" priority />
          <h1 className="select-agent-title">FPA Intelligence</h1>
          <p className="select-agent-subtitle">Choisissez votre assistant intelligent</p>
        </div>

        <div className="select-agent-grid">
          {agents.map((agent) => (
            <button
              key={agent.id}
              className={`select-agent-card ${hoveredAgent === agent.id ? 'hovered' : ''} ${selectedAgent === agent.id ? 'selected' : ''}`}
              onMouseEnter={() => setHoveredAgent(agent.id)}
              onMouseLeave={() => setHoveredAgent(null)}
              onClick={() => handleSelect(agent)}
              style={{ '--agent-color': agent.color } as React.CSSProperties}
            >
              <div className="select-agent-card-icon">
                <i className={`ph ph-${agent.icon}`}></i>
              </div>
              <h2 className="select-agent-card-title">{agent.title}</h2>
              <p className="select-agent-card-subtitle">{agent.subtitle}</p>
              <p className="select-agent-card-description">{agent.description}</p>
              <div className="select-agent-card-features">
                {agent.features.map((f, i) => (
                  <span key={i} className="select-agent-feature-tag">
                    <i className="ph ph-check-circle"></i>
                    {f}
                  </span>
                ))}
              </div>
              <div className="select-agent-card-arrow">
                <i className="ph ph-arrow-right"></i>
              </div>
            </button>
          ))}
        </div>

        <p className="select-agent-footer">
          Connecté en tant que <strong>{session.user?.name || 'Admin'}</strong> — © 2026 FinancePro Advisory
        </p>
      </div>
    </div>
  );
}

export default function SelectAgentPage() {
  return (
    <Providers>
      <SelectAgentContent />
    </Providers>
  );
}
