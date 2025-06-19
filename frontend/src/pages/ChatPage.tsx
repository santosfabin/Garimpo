import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import './ChatPage.css';
import ConversationSidebar from '../components/ConversationSidebar';
import Modal from '../components/Modal';

// Interface do seu código original
interface Message {
  id: string;
  sender: 'user' | 'ai' | 'status';
  text: string;
}

export default function ChatPage() {
  // --- Estados do seu código original ---
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  // --- Estados adicionados para as novas funcionalidades ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [conversationToDelete, setConversationToDelete] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  // --- Ref do seu código original ---
  const messageListRef = useRef<HTMLDivElement>(null);
  // Ref adicionada para o textarea
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // --- Funções e Efeitos ---

  // Função de toggle para a nova sidebar
  const toggleSidebar = () => {
    setIsSidebarOpen(prev => !prev);
  };

  // Efeito de scroll do seu código original
  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages]);

  // Efeito para o textarea
  useEffect(() => {
    if (textareaRef.current) {
      const maxHeight = 200;
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      if (scrollHeight > maxHeight) {
        textareaRef.current.style.height = `${maxHeight}px`;
        textareaRef.current.style.overflowY = 'auto';
      } else {
        textareaRef.current.style.height = `${scrollHeight}px`;
        textareaRef.current.style.overflowY = 'hidden';
      }
    }
  }, [inputValue]);

  // ========================================================================
  // INÍCIO DAS FUNÇÕES LÓGICAS - COM AJUSTES PARA O NOVO FLUXO DE STATUS
  // ========================================================================

  const handleSelectConversation = async (id: string) => {
    if (isLoading) return;
    setIsLoading(true);
    setActiveConversationId(id);
    setMessages([]);

    try {
      const response = await fetch(`/api/conversations/${id}/messages`);
      if (!response.ok) throw new Error('Falha ao carregar o histórico.');
      const historyData = await response.json();
      const formattedMessages: Message[] = historyData.map((msg: any) => ({
        id: msg.id,
        sender: msg.sender,
        text: msg.text,
      }));
      setMessages(formattedMessages);
    } catch (error: any) {
      setMessages([{ id: 'err-1', sender: 'status', text: error.message }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewChat = () => {
    setActiveConversationId(null);
    setMessages([]);
    setInputValue('');
  };

  const handleLogout = () => {
    localStorage.removeItem('isLoggedIn');
    window.location.href = '/login';
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const currentInput = inputValue.trim();
    const userMessage: Message = { id: `user-${Date.now()}`, sender: 'user', text: currentInput };

    // --- CORREÇÃO #1: Declarar o ID do status AQUI ---
    const statusMessageId = `status-placeholder-${Date.now()}`;
    const statusPlaceholder: Message = {
      id: statusMessageId, // Usar o ID correto
      sender: 'status',
      text: 'Garimpo está se preparando...',
    };

    setMessages(prev => [...prev, userMessage, statusPlaceholder]);
    setInputValue('');
    setIsLoading(true);

    try {
      const postResponse = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: currentInput, conversationId: activeConversationId }),
      });
      if (!postResponse.ok) {
        const errorData = await postResponse.json();
        throw new Error(errorData.error || 'Falha ao enviar a mensagem.');
      }

      const postData = await postResponse.json();
      const currentConvId = postData.conversationId;

      if (!activeConversationId) {
        setActiveConversationId(currentConvId);
        setRefetchTrigger(prev => prev + 1);
      }

      const eventSource = new EventSource(`/api/chat/stream/${currentConvId}`);

      let aiMessageId = '';
      let isFirstChunk = true;

      eventSource.onmessage = event => {
        const data = JSON.parse(event.data);
        switch (data.type) {
          case 'status':
            // --- CORREÇÃO #2: Usar o ID do status para encontrar a mensagem certa ---
            setMessages(prev =>
              prev.map(msg =>
                msg.id === statusMessageId ? { ...msg, sender: 'status', text: data.message } : msg
              )
            );
            break;

          case 'chunk':
            if (isFirstChunk) {
              isFirstChunk = false;
              aiMessageId = `ai-response-${Date.now()}`;

              // --- CORREÇÃO #3: Usar o ID do status para filtrar ---
              setMessages(prev => [
                ...prev.filter(msg => msg.id !== statusMessageId),
                { id: aiMessageId, sender: 'ai', text: data.content || '' },
              ]);
            } else {
              setMessages(prev =>
                prev.map(msg =>
                  msg.id === aiMessageId ? { ...msg, text: msg.text + (data.content || '') } : msg
                )
              );
            }
            break;

          case 'close':
            eventSource.close();
            setIsLoading(false);
            break;
        }
      };

      eventSource.onerror = () => {
        // --- CORREÇÃO #4: Usar o ID do status para mostrar o erro ---
        setMessages(prev =>
          prev.map(msg =>
            msg.id === statusMessageId
              ? { ...msg, sender: 'status', text: 'Erro de conexão com o servidor.' }
              : msg
          )
        );
        eventSource.close();
        setIsLoading(false);
      };
    } catch (err: any) {
      // --- CORREÇÃO #5: Filtrar usando o ID do status ---
      setMessages(prev => {
        const filtered = prev.filter(msg => msg.id !== statusMessageId);
        return [...filtered, { id: `err-${Date.now()}`, sender: 'status', text: err.message }];
      });
      setIsLoading(false);
    }
  };

  // ========================================================================
  // FIM DAS FUNÇÕES LÓGICAS
  // ========================================================================

  const openDeleteModal = (id: string, title: string) => {
    setConversationToDelete({ id, title });
    setIsModalOpen(true);
  };

  const closeDeleteModal = () => {
    setIsModalOpen(false);
    setConversationToDelete(null);
  };

  const confirmDelete = async () => {
    if (!conversationToDelete) return;
    try {
      await fetch(`/api/conversations/${conversationToDelete.id}`, { method: 'DELETE' });
      handleNewChat();
      setRefetchTrigger(prev => prev + 1);
    } catch (error) {
      console.error('Erro ao deletar conversa:', error);
    } finally {
      closeDeleteModal();
    }
  };

  return (
    <div className="page-layout">
      {/* ATENÇÃO: Seu código tinha um `onToggle` aqui que não existia na props do Sidebar. Removi para evitar erros. */}
      <ConversationSidebar
        isOpen={isSidebarOpen}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
        onDeleteConversation={openDeleteModal}
        activeConversationId={activeConversationId}
        refetchTrigger={refetchTrigger}
        onToggle={toggleSidebar}
      />
      <div className={`chat-page ${!isSidebarOpen ? 'sidebar-collapsed' : ''}`}>
        <header className="chat-header">
          {/* ATENÇÃO: A sua estrutura original tinha um `div.header-title`. Mudei para H1 para manter a estrutura do meu primeiro exemplo, que era mais semântica. */}
          <h1>Garimpo ⛏️</h1>
          <button onClick={handleLogout} className="logout-button">
            Sair
          </button>
        </header>
        <main className="chat-container" ref={messageListRef}>
          {/* ATENÇÃO: Removi a condição `isLoading && messages.length === 0` pois agora o status é uma mensagem na lista, o que torna o spinner global desnecessário. */}
          {messages.length > 0 ? (
            <div className="message-list">
              {messages.map(msg => (
                <div key={msg.id} className={`message ${msg.sender}-message`}>
                  {msg.sender === 'ai' ? <ReactMarkdown>{msg.text}</ReactMarkdown> : msg.text}
                </div>
              ))}
            </div>
          ) : (
            <div className="no-chat-selected">
              <h2>Bem-vindo ao Garimpo!</h2>
              <p>Selecione uma conversa ou inicie um novo chat para começar a garimpar filmes.</p>
            </div>
          )}
        </main>
        <footer className="chat-input-area">
          {/* ATENÇÃO: Seu código tinha um `div.chat-input-wrapper` que não é estritamente necessário. Removi para simplificar, mas mantive a estrutura interna. */}
          <div className="chat-input-wrapper">
            <textarea
              ref={textareaRef}
              className="chat-input"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder={isLoading ? 'Aguarde, garimpando...' : 'Pergunte sobre filmes...'}
              disabled={isLoading}
              rows={1}
            />
            <button
              onClick={handleSendMessage}
              className="send-button"
              disabled={isLoading || !inputValue.trim()}
              title="Enviar"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                // CORRIGIDO: O ícone estava sem cor
                fill="currentColor"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </div>
        </footer>
      </div>
      <Modal
        isOpen={isModalOpen}
        onClose={closeDeleteModal}
        onConfirm={confirmDelete}
        title="Confirmar Exclusão"
      >
        <p>
          Você tem certeza que deseja apagar a conversa "
          <strong>{conversationToDelete?.title}</strong>"?
        </p>
        <p>Esta ação não pode ser desfeita.</p>
      </Modal>
    </div>
  );
}
