// frontend/src/pages/ChatPage.tsx
import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import './ChatPage.css';
import ConversationSidebar from '../components/ConversationSidebar';
import Modal from '../components/Modal';
import SkeletonMessage from '../components/SkeletonMessage';
import ThoughtProcess from '../components/ThoughtProcess';

// Definição dos tipos
interface LogStep {
  logType: 'tool_call' | 'tool_result';
  payload: any;
}

interface Message {
  id: string;
  sender: 'user' | 'ai' | 'status';
  text: string;
  processId?: string;
  thoughtLog?: LogStep[];
}

interface ThoughtProcesses {
  [processId: string]: LogStep[];
}

// <<< [NOVO] Definição das sugestões de prompt
const promptSuggestions = [
  {
    title: 'O que está em cartaz?',
    subtitle: 'Informação em tempo real',
    prompt: 'Me fale o que está passando no cinema hoje',
  },
  {
    title: 'Onde assistir?',
    subtitle: 'Informação prática',
    prompt: 'Onde posso assistir o filme do Homem de Ferro?',
  },
  {
    title: 'Recomende algo parecido com o filme Interestelar',
    subtitle: 'Recomendação personalizada',
    prompt: "Gostei de 'Interestelar', pode me recomendar filmes parecidos?",
  },
  {
    title: 'Detalhes do filme A Origem',
    subtitle: 'Conhecimento detalhado',
    prompt: "Me fale mais sobre o filme 'A Origem', incluindo o elenco principal.",
  },
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [thoughtProcesses, setThoughtProcesses] = useState<ThoughtProcesses>({});

  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingHistory, setIsFetchingHistory] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [conversationToDelete, setConversationToDelete] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  const messageListRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const toggleSidebar = () => {
    setIsSidebarOpen(prev => !prev);
  };

  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages, thoughtProcesses]);

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

  const handleSelectConversation = async (id: string) => {
    if (isLoading && id !== activeConversationId) return;

    setIsFetchingHistory(true);
    setActiveConversationId(id);
    setMessages([]);
    setThoughtProcesses({});

    try {
      const response = await fetch(`/api/conversations/${id}/messages`);
      if (!response.ok) throw new Error('Falha ao carregar histórico.');

      const historyData = await response.json();

      const formattedMessages: Message[] = [];
      const loadedThoughtProcesses: ThoughtProcesses = {};

      historyData.forEach((msg: any) => {
        formattedMessages.push({
          id: msg.id.toString(),
          sender: msg.sender,
          text: msg.text,
          thoughtLog: msg.thoughtLog,
        });

        if (msg.sender === 'ai' && msg.thoughtLog) {
          loadedThoughtProcesses[msg.id.toString()] = msg.thoughtLog;
        }
      });

      setMessages(formattedMessages);
      setThoughtProcesses(loadedThoughtProcesses);
    } catch (error: any) {
      setMessages([{ id: 'err-1', sender: 'status', text: error.message }]);
    } finally {
      setIsFetchingHistory(false);
    }
  };

  const handleNewChat = () => {
    setActiveConversationId(null);
    setMessages([]);
    setInputValue('');
    setThoughtProcesses({});
  };

  const handleLogout = () => {
    localStorage.removeItem('isLoggedIn');
    window.location.href = '/login';
  };

  // <<< [NOVO] Função que lida com o clique na sugestão
  const handleSuggestionClick = (prompt: string) => {
    setInputValue(prompt);
  };

  // <<< [NOVO] Efeito que envia a mensagem automaticamente ao clicar na sugestão
  useEffect(() => {
    const isSuggestion = promptSuggestions.some(s => s.prompt === inputValue);
    if (isSuggestion && !isLoading) {
      handleSendMessage();
    }
  }, [inputValue, isLoading]); // Adicionado isLoading como dependência para segurança

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const currentInput = inputValue.trim();
    const userMessage: Message = { id: `user-${Date.now()}`, sender: 'user', text: currentInput };

    const statusMessageId = `status-placeholder-${Date.now()}`;
    const statusPlaceholder: Message = {
      id: statusMessageId,
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

      if (!postResponse.ok) throw new Error('Falha ao enviar a mensagem.');
      const postData = await postResponse.json();
      const currentConvId = postData.conversationId;

      if (!activeConversationId) {
        setActiveConversationId(currentConvId);
        setRefetchTrigger(prev => prev + 1);
      }

      const eventSource = new EventSource(`/api/chat/stream/${currentConvId}`);

      let aiMessageId = '';
      let currentProcessId = '';
      let isFirstChunk = true;

      eventSource.onmessage = event => {
        const data = JSON.parse(event.data);
        switch (data.type) {
          case 'process_start':
            currentProcessId = data.processId;
            setThoughtProcesses(prev => ({ ...prev, [currentProcessId]: [] }));
            break;

          case 'log_step':
            if (data.processId) {
              const newStep: LogStep = { logType: data.logType, payload: data.payload };
              setThoughtProcesses(prev => ({
                ...prev,
                [data.processId]: [...(prev[data.processId] || []), newStep],
              }));
            }
            break;

          case 'status':
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
              setMessages(prev => [
                ...prev.filter(msg => msg.id !== statusMessageId),
                {
                  id: aiMessageId,
                  sender: 'ai',
                  text: data.content || '',
                  processId: currentProcessId,
                },
              ]);
            } else {
              setMessages(prev =>
                prev.map(msg =>
                  msg.id === aiMessageId ? { ...msg, text: msg.text + (data.content || '') } : msg
                )
              );
            }
            break;
          case 'process_end':
            break;
          case 'close':
            eventSource.close();
            setIsLoading(false);
            if (!activeConversationId) {
              handleSelectConversation(currentConvId);
            }
            break;
        }
      };
      eventSource.onerror = () => {
        setMessages(prev => prev.filter(m => m.id !== statusMessageId));
        setIsLoading(false);
        eventSource.close();
      };
    } catch (err: any) {
      setMessages(prev => [
        ...prev.filter(m => m.sender !== 'status'),
        { id: `status-${Date.now()}`, sender: 'status', text: err.message },
      ]);
      setIsLoading(false);
    }
  };

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
      const response = await fetch(`/api/conversations/${conversationToDelete.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Falha ao apagar a conversa.');
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
      <ConversationSidebar
        isOpen={isSidebarOpen}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
        onDeleteConversation={openDeleteModal}
        activeConversationId={activeConversationId}
        refetchTrigger={refetchTrigger}
        onToggle={toggleSidebar}
      />
      <div className="chat-page">
        <header className="chat-header">
          <h1>
            Garimpo
            <img src="/icon.png" alt="Logo de picareta" className="logo-icon" />
          </h1>
          <button onClick={handleLogout} className="logout-button">
            Sair
          </button>
        </header>

        <main className="chat-container" ref={messageListRef}>
          {isFetchingHistory ? (
            <div className="message-list">
              {[...Array(5)].map((_, index) => (
                <SkeletonMessage key={index} align={index % 2 === 0 ? 'left' : 'right'} />
              ))}
            </div>
          ) : messages.length > 0 ? (
            <div className="message-list">
              {messages.map(msg => (
                <div key={msg.id} className={`message-wrapper ${msg.sender}-wrapper`}>
                  {msg.sender === 'ai' && (
                    <ThoughtProcess
                      steps={
                        thoughtProcesses[msg.id] || thoughtProcesses[msg.processId || ''] || []
                      }
                    />
                  )}
                  <div className={`message ${msg.sender}-message`}>
                    {msg.sender === 'ai' ? <ReactMarkdown>{msg.text}</ReactMarkdown> : msg.text}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            // <<< [NOVO] Renderização condicional da tela de boas-vindas
            <div className="no-chat-selected">
              <div className="welcome-header">
                <h1>Bem vindo ao Garimpo</h1>
                <img src="/icon.png" alt="Logo de picareta" className="welcome-logo" />
              </div>
              <p>Sua IA especialista em cinema. Comece uma conversa ou use uma sugestão:</p>
              <div className="suggestion-grid">
                {promptSuggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    className="suggestion-card"
                    onClick={() => handleSuggestionClick(suggestion.prompt)}
                  >
                    <span className="suggestion-title">{suggestion.title}</span>
                    <span className="suggestion-subtitle">{suggestion.subtitle}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </main>

        <footer className="chat-input-area">
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
        <div className="modal-warning">Esta ação não pode ser desfeita.</div>
      </Modal>
    </div>
  );
}
