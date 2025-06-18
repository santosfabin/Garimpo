import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import './ChatPage.css';

interface Message {
  id: string;
  sender: 'user' | 'ai' | 'status';
  text: string;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const messageListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages]);

  const handleLogout = async () => {
    localStorage.removeItem('isLoggedIn');
    window.location.href = '/login';
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: inputValue,
    };
    setMessages(prev => [...prev, userMessage]);
    const currentInput = inputValue;
    setInputValue('');
    setIsLoading(true);

    try {
      const postResponse = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: currentInput, conversationId: conversationId }),
      });

      if (!postResponse.ok) throw new Error('Falha ao enviar a mensagem.');

      const postData = await postResponse.json();
      const currentConvId = postData.conversationId;
      if (!conversationId) setConversationId(currentConvId);

      const eventSource = new EventSource(`/api/chat/stream/${currentConvId}`);

      const aiMessageId = `ai-${Date.now()}`;
      setMessages(prev => [...prev, { id: aiMessageId, sender: 'ai', text: '' }]);

      // --- CORREÇÃO AQUI ---
      // Definimos a função de atualização em um escopo que ambos os listeners podem acessar.
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
            updateMessageById(msg => ({
              ...msg,
              sender: 'ai',
              text: msg.text + data.content,
            }));
            break;

          case 'close':
            eventSource.close();
            setIsLoading(false);
            break;
        }
      };

      eventSource.onerror = () => {
        // Agora 'updateMessageById' está acessível aqui.
        updateMessageById(msg => ({
          ...msg,
          sender: 'status',
          text: 'Erro de conexão com o servidor.',
        }));
        eventSource.close();
        setIsLoading(false);
      };
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        {
          id: `status-${Date.now()}`,
          sender: 'status',
          text: err.message || 'Erro ao enviar mensagem.',
        },
      ]);
      setIsLoading(false);
    }
  };

  return (
    <div className="chat-page">
      <header className="chat-header">
        <h1>Garimpo ⛏️</h1>
        <button onClick={handleLogout} className="logout-button">
          Sair
        </button>
      </header>

      <main className="chat-container" ref={messageListRef}>
        <div className="message-list">
          {messages.map(msg => (
            <div key={msg.id} className={`message ${msg.sender}-message`}>
              {msg.sender === 'ai' ? <ReactMarkdown>{msg.text}</ReactMarkdown> : msg.text}
            </div>
          ))}
        </div>
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
  );
}
