import React, { useEffect, useState } from 'react';
import './ConversationSidebar.css';

interface Conversation {
  id: string;
  title: string;
}

// --- CORREÇÃO AQUI ---
interface SidebarProps {
  onSelectConversation: (id: string) => void;
  onNewChat: () => void; // Adicione esta linha
  activeConversationId: string | null;
}

// Agora a desestruturação dos props vai funcionar sem erros
export default function ConversationSidebar({
  onSelectConversation,
  onNewChat,
  activeConversationId,
}: SidebarProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [shouldRefetch, setShouldRefetch] = useState(true);

  useEffect(() => {
    // Busca a lista de conversas quando o componente é montado ou quando forçamos um refetch
    if (shouldRefetch) {
      const fetchConversations = async () => {
        try {
          const response = await fetch('/api/conversations');
          if (!response.ok) throw new Error('Falha ao buscar conversas.');
          const data = await response.json();
          setConversations(data);
        } catch (error) {
          console.error(error);
        } finally {
          setShouldRefetch(false); // Impede recargas contínuas
        }
      };
      fetchConversations();
    }
  }, [shouldRefetch]);

  // Modificamos handleNewChat para forçar uma recarga da lista de conversas
  const handleNewChatClick = () => {
    onNewChat(); // Chama a função do pai para limpar o estado
    setShouldRefetch(true); // Diz à sidebar para buscar a lista de conversas novamente (caso uma tenha sido criada)
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <button onClick={handleNewChatClick} className="new-chat-button">
          + Novo Chat
        </button>
      </div>
      <nav className="conversation-list">
        {conversations.map(convo => (
          <a
            key={convo.id}
            href="#"
            className={`conversation-item ${convo.id === activeConversationId ? 'active' : ''}`}
            onClick={e => {
              e.preventDefault();
              onSelectConversation(convo.id);
            }}
          >
            {convo.title}
          </a>
        ))}
      </nav>
    </aside>
  );
}
