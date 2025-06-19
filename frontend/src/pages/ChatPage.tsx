import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import './ChatPage.css';
import ConversationSidebar from '../components/ConversationSidebar';
import Modal from '../components/Modal';

interface Message {
  id: string;
  sender: 'user' | 'ai' | 'status';
  text: string;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [conversationToDelete, setConversationToDelete] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  const messageListRef = useRef<HTMLDivElement>(null);

  const toggleSidebar = () => {
    setIsSidebarOpen(prev => !prev);
  };

  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSelectConversation = async (id: string) => {
    if (isLoading && id !== activeConversationId) return;

    setIsLoading(true);
    setActiveConversationId(id);
    setMessages([]);
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
      setIsLoading(false);
    }
  };

  const handleNewChat = () => {
    setActiveConversationId(null);
    setMessages([]);
    setInputValue('');
  };

  // Substitua a função handleLogout existente por esta:
  const handleLogout = async () => {
    try {
      const response = await fetch('/api/logout', {
        method: 'DELETE',
      });

      if (!response.ok) {
        console.error('Falha ao fazer logout no servidor.');
        // Mesmo que falhe, vamos tentar limpar o lado do cliente
      }
    } catch (error) {
      console.error('Erro de rede ao tentar fazer logout:', error);
    } finally {
      // Esta parte sempre executa, garantindo a limpeza e o redirecionamento
      localStorage.removeItem('isLoggedIn');
      window.location.href = '/login';
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const currentInput = inputValue;
    const userMessage: Message = { id: `user-${Date.now()}`, sender: 'user', text: currentInput };
    setMessages(prev => [...prev, userMessage]);
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
      const aiMessageId = `ai-${Date.now()}`;
      setMessages(prev => [...prev, { id: aiMessageId, sender: 'ai', text: '' }]);

      const updateMessageById = (updateFn: (msg: Message) => Message) => {
        setMessages(prev => prev.map(msg => (msg.id === aiMessageId ? updateFn(msg) : msg)));
      };

      eventSource.onmessage = event => {
        const data = JSON.parse(event.data);
        switch (data.type) {
          case 'status':
            updateMessageById(msg => ({ ...msg, sender: 'status', text: data.message }));
            break;
          case 'chunk':
            updateMessageById(msg => ({ ...msg, sender: 'ai', text: msg.text + data.content }));
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
      />
      <div className="chat-page">
        <header className="chat-header">
          <button
            onClick={toggleSidebar}
            className="sidebar-toggle-button"
            title={isSidebarOpen ? 'Fechar menu' : 'Abrir menu'}
          >
            {/* --- LÓGICA DE TROCA DE ÍCONE AQUI --- */}
            {isSidebarOpen ? (
              // Ícone "X" (fechar)
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            ) : (
              // Ícone "Menu" (abrir)
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            )}
          </button>

          <h1>Garimpo ⛏️</h1>
          <button onClick={handleLogout} className="logout-button">
            Sair
          </button>
        </header>

        <main className="chat-container" ref={messageListRef}>
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
          <input
            type="text"
            className="chat-input"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
            placeholder={isLoading ? 'Garimpo está garimpando...' : 'Pergunte sobre filmes...'}
            disabled={isLoading}
          />
          <button onClick={handleSendMessage} className="send-button" disabled={isLoading}>
            Enviar
          </button>
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
