# Frontend - Garimpo ⛏️

Este é o frontend da aplicação Garimpo, construído com React e Vite. Ele fornece a interface de usuário para interagir com o assistente de cinema, visualizar conversas e gerenciar a sessão do usuário.

## Tecnologias Utilizadas

- **Framework:** React 19
- **Build Tool:** Vite
- **Linguagem:** TypeScript
- **Roteamento:** React Router DOM v7
- **Markdown:** `react-markdown` para renderizar as respostas da IA, que podem conter formatação.
- **Linting:** ESLint e TypeScript-ESLint para garantir a qualidade do código.

## Estrutura de Pastas (`/src`)

- **`pages/`**: Contém os componentes de página principais.
  - `ChatPage.tsx`: A tela principal de chat, onde toda a interação acontece.
  - `LoginPage.tsx`: A tela de login do usuário.
- **`components/`**: Contém componentes reutilizáveis.
  - `ConversationSidebar.tsx`: A barra lateral que lista o histórico de conversas.
  - `Modal.tsx`: Um componente de modal genérico, usado para a confirmação de exclusão.
  - `AuthChecker.tsx`: Um componente de ordem superior (wrapper) que protege as rotas e gerencia o estado de autenticação.
- **`App.tsx`**: O componente raiz da aplicação, onde as rotas são definidas.
- **`main.tsx`**: O ponto de entrada da aplicação, onde o React é montado no DOM.
- **`vite.config.ts`**: Arquivo de configuração do Vite, notavelmente configurado com um proxy para redirecionar requisições `/api` para o servidor backend durante o desenvolvimento.

## Funcionalidades

- **Autenticação de Usuário:** Sistema de login seguro que se comunica com o backend.
- **Proteção de Rotas:** O `AuthChecker` garante que apenas usuários logados possam acessar a página de chat.
- **Interface de Chat em Tempo Real:** As mensagens do usuário são enviadas e as respostas da IA são recebidas e renderizadas em tempo real usando `EventSource` (Server-Sent Events).
- **Histórico de Conversas:** A `ConversationSidebar` permite ao usuário navegar entre conversas passadas e iniciar novas.
- **Gerenciamento de Conversas:** O usuário pode criar e excluir conversas.
- **Renderização de Markdown:** As respostas da IA são formatadas usando `ReactMarkdown`, permitindo o uso de listas, negrito, etc.

## Como Executar (Standalone)

1.  **Pré-requisito:** Ter o Node.js (v20+) instalado.
2.  **Navegue até a pasta:**
    ```bash
    cd frontend
    ```
3.  **Instale as dependências:**
    ```bash
    npm install
    ```
4.  **Inicie o servidor de desenvolvimento:**
    ```bash
    npm run dev
    ```
5.  **Acesse a aplicação:**
    - Abra seu navegador em `http://localhost:5173` (ou a porta indicada pelo Vite).
    - **Importante:** O servidor backend deve estar rodando em `http://localhost:7000` para que o proxy de API funcione corretamente.

### Scripts Disponíveis

- `npm run dev`: Inicia o servidor de desenvolvimento com Hot Module Replacement (HMR).
- `npm run build`: Compila e otimiza a aplicação para produção na pasta `dist/`.
- `npm run lint`: Executa o ESLint para verificar erros e padrões de código.
- `npm run preview`: Inicia um servidor local para visualizar a build de produção.
