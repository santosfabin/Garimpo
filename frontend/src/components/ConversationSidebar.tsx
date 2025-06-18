import React, { useEffect, useState } from 'react';
import './ConversationSidebar.css';

interface Conversation {
  id: string;
  title: string;
}

interface SidebarProps {
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onDeleteConversation: (id: string, title: string) => void;
  activeConversationId: string | null;
  refetchTrigger: number;
  isOpen: boolean;
}

export default function ConversationSidebar({
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
  activeConversationId,
  refetchTrigger,
  isOpen,
}: SidebarProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Este useEffect agora roda quando o componente é montado
    // e toda vez que `refetchTrigger` mudar de valor.
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
    <aside className={`sidebar ${isOpen ? '' : 'collapsed'}`}>
      <div className="sidebar-header">
        <button onClick={onNewChat} className="new-chat-button">
          + Novo Chat
        </button>
      </div>
      <nav className="conversation-list">
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
    </aside>
  );
}
