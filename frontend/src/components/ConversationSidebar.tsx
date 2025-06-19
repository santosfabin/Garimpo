import React, { useEffect, useState } from 'react';
import './ConversationSidebar.css';

interface Conversation {
  id: string;
  title: string;
}

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onDeleteConversation: (id: string, title: string) => void;
  activeConversationId: string | null;
  refetchTrigger: number;
}

export default function ConversationSidebar({
  isOpen,
  onToggle,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
  activeConversationId,
  refetchTrigger,
}: SidebarProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // A busca de conversas permanece a mesma...
    const fetchConversations = async () => {
      console.log('Buscando lista de conversas...');
      try {
        const response = await fetch('/api/conversations');
        if (!response.ok) {
          throw new Error('Falha ao buscar o histórico de conversas.');
        }
        const data = await response.json();
        setConversations(data);
        setError(null);
      } catch (err: any) {
        console.error(err);
        setError(err.message);
      }
    };
    fetchConversations();
  }, [refetchTrigger]);

  return (
    <aside className={`sidebar ${!isOpen ? 'collapsed' : ''}`}>
      {/* Botão para RECOLHER (visível quando ABERTO) */}
      <button
        onClick={onToggle}
        className="sidebar-toggle-button collapse-button"
        title="Recolher menu"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="9" y1="3" x2="9" y2="21"></line>
        </svg>
      </button>

      {/* Botão para EXPANDIR (visível quando RECOLHIDO) */}
      <button
        onClick={onToggle}
        className="sidebar-toggle-button expand-button"
        title="Expandir menu"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="15" y1="3" x2="15" y2="21"></line>
        </svg>
      </button>

      <div className="sidebar-content">
        <div className="sidebar-header">
          <div className="brand-title">Garimpo</div>
        </div>
        <div className="sidebar-actions">
          <button onClick={onNewChat} className="new-chat-button">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>Novo Chat</span>
          </button>
        </div>
        <nav className="conversation-list">
          <div className="chats-title">Conversas</div>
          {error && <div className="sidebar-error">{error}</div>}
          {conversations.map(convo => (
            <div
              key={convo.id}
              className={`conversation-item-wrapper ${
                convo.id === activeConversationId ? 'active' : ''
              }`}
            >
              <a
                href="#"
                className="conversation-link"
                onClick={e => {
                  e.preventDefault();
                  onSelectConversation(convo.id);
                }}
              >
                {convo.title}
              </a>
              <button
                className="delete-button"
                title="Apagar conversa"
                onClick={() => onDeleteConversation(convo.id, convo.title)}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="trash-icon"
                >
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  <line x1="10" y1="11" x2="10" y2="17"></line>
                  <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
              </button>
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );
}
