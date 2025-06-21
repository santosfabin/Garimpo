import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import './ChatPage.css';
import ConversationSidebar from '../components/ConversationSidebar';
import Modal from '../components/Modal';
import SkeletonMessage from '../components/SkeletonMessage'; // Importe o novo componente

interface Message {
  id: string;
  sender: 'user' | 'ai' | 'status';
  text: string;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingHistory, setIsFetchingHistory] = useState(false); // Novo estado para o histórico
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [conversationToDelete, setConversationToDelete] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  const messageListRef = useRef<HTMLDivElement>(null);
  // Ref adicionada para o textarea
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const toggleSidebar = () => {
    setIsSidebarOpen(prev => !prev);
  };

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

  const handleSelectConversation = async (id: string) => {
    if (isLoading && id !== activeConversationId) return;

    setIsFetchingHistory(true); // Ativa o skeleton loader
    setActiveConversationId(id);
    setMessages([]); // Limpa as mensagens antigas para dar lugar ao skeleton

    try {
      const response = await fetch(`/api/conversations/${id}/messages`);
      if (!response.ok) throw new Error('Falha ao carregar histórico.');

      const historyData = await response.json();
      const formattedMessages: Message[] = historyData.map((msg: any) => ({
        id: msg.id.toString(),
        sender: msg.sender,
        text: msg.text,
      }));
      setMessages(formattedMessages);
    } catch (error: any) {
      setMessages([{ id: 'err-1', sender: 'status', text: error.message }]);
    } finally {
      setIsFetchingHistory(false); // Desativa o skeleton loader
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

      if (!postResponse.ok) throw new Error('Falha ao enviar a mensagem.');
      const postData = await postResponse.json();
      const currentConvId = postData.conversationId;

      if (!activeConversationId) {
        setActiveConversationId(currentConvId);
        setRefetchTrigger(prev => prev + 1);
      }

      const eventSource = new EventSource(`/api/chat/stream/${currentConvId}`);

      let aiMessageId = '';

      const updateMessageById = (updateFn: (msg: Message) => Message) => {
        setMessages(prev => prev.map(msg => (msg.id === aiMessageId ? updateFn(msg) : msg)));
      };
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
        updateMessageById(msg => ({ ...msg, sender: 'status', text: 'Erro de conexão.' }));
        eventSource.close();
        setIsLoading(false);
      };
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
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
        {/* O texto principal continua como um parágrafo */}
        <p>
          Você tem certeza que deseja apagar a conversa "
          <strong>{conversationToDelete?.title}</strong>"?
        </p>

        {/* O aviso agora está dentro de uma div com uma classe específica */}
        <div className="modal-warning">Esta ação não pode ser desfeita.</div>
      </Modal>
    </div>
  );
}
