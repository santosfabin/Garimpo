# Backend - Garimpo ⛏️

Este é o backend da aplicação Garimpo. Ele serve como o cérebro do sistema, responsável por:

- Gerenciamento de usuários (cadastro, login, autenticação).
- Persistência de conversas e mensagens em um banco de dados PostgreSQL.
- Comunicação com a API da OpenAI através do LangChain para processar as solicitações do usuário.
- Utilização de "ferramentas" (funções) que buscam dados na API do The Movie Database (TMDB) para fornecer informações precisas sobre filmes.
- Servir a API RESTful e o streaming de respostas para o frontend.

## Como Executar (Com Docker - Recomendado)

Este é o método mais simples e completo para rodar o ambiente.

1.  **Navegue até esta pasta (`backend`).**

- Com o comando

  ```bash
  cd backend
  ```

2.  **Configure o `.env`:**

- Copie o arquivo `.env.example` para `.env`:
  ```bash
  cp .env.example .env
  ```
- Edite o arquivo `.env` e preencha suas chaves `SECRET_KEY`, `OPENAI_API_KEY`, e `TMDB_API_KEY`.

3.  **Inicie os contêineres:**

- O comando `-d` (detached) executa os contêineres em segundo plano.
  ```bash
  docker-compose up --build -d
  ```
- Aguarde alguns segundos para o serviço `db` iniciar completamente.

4.  **Crie as tabelas no banco de dados:**

- Para interagir com o banco de dados dentro do contêiner, primeiro abra um terminal `psql`:
  ```bash
  docker-compose exec db psql -U meuuser -d meubanco
  ```
- Agora, com o terminal `psql` aberto, copie e cole os blocos de código SQL abaixo, um por um, para criar a estrutura do banco.

- **Tabela de Usuários:** Armazena as informações de login.

  ```sql
  CREATE TABLE users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
  ```

- **Extensão para UUIDs:** Necessária para gerar IDs únicos.

  ```sql
  CREATE EXTENSION IF NOT EXISTS "pgcrypto";
  ```

- **Tipo para Remetente:** Define os possíveis remetentes de uma mensagem.

  ```sql
  CREATE TYPE sender_type AS ENUM ('user', 'ai');
  ```

- **Tabela de Conversas:** Guarda o histórico de chats de cada usuário.

  ```sql
  CREATE TABLE conversations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      title VARCHAR(255) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_user
          FOREIGN KEY(user_id)
          REFERENCES users(id)
          ON DELETE CASCADE
  );
  ```

- **Tabela de Mensagens:** Armazena cada mensagem de cada conversa.
  ```sql
  CREATE TABLE messages (
      id BIGSERIAL PRIMARY KEY,
      conversation_id UUID NOT NULL,
      sender sender_type NOT NULL,
      message_text TEXT NOT NULL,
      timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_conversation
          FOREIGN KEY(conversation_id)
          REFERENCES conversations(id)
          ON DELETE CASCADE
  );
  ```
- Após executar todos os comandos, digite `\q` e pressione Enter para sair do `psql`. O seu banco de dados está pronto.

## Estrutura de Pastas (`/src`)

- **`routes/`**: Define os endpoints da API.
- **`controller/`**: Camada responsável por receber as requisições HTTP e enviar as respostas.
- **`services/`**: Contém a lógica de negócio principal.
- **`repository/`**: Camada de acesso a dados, abstraindo a comunicação com o banco.
- **`database/`**: Configuração da conexão e script de criação das tabelas.
- **`utils/`**: Funções utilitárias.
- **`middleware/`**: Middlewares do Express, como `verifyActiveSession`.
- **`interfaces/`**: Definições de tipos e interfaces TypeScript.
- **`config/`**: Carrega e exporta as variáveis de ambiente.
- **`app.ts`**: Ponto de entrada da aplicação Express.

## Endpoints da API

A API está disponível sob o prefixo `/api`.

| Método HTTP | Rota                           | Descrição                                           | Autenticação Necessária? |
| :---------- | :----------------------------- | :-------------------------------------------------- | :----------------------- |
| `POST`      | `/users`                       | Cria um novo usuário.                               | Não                      |
| `GET`       | `/users`                       | Retorna os dados do usuário logado.                 | Sim                      |
| `PATCH`     | `/users`                       | Atualiza os dados do usuário logado.                | Sim                      |
| `DELETE`    | `/users`                       | Remove a conta do usuário logado.                   | Sim                      |
| `POST`      | `/login`                       | Autentica um usuário e retorna um cookie de sessão. | Não                      |
| `GET`       | `/login/checkLogin`            | Verifica se a sessão (cookie) ainda é válida.       | Sim                      |
| `DELETE`    | `/logout`                      | Encerra a sessão do usuário, limpando o cookie.     | Sim                      |
| `POST`      | `/chat`                        | Envia uma nova mensagem para a IA.                  | Sim                      |
| `GET`       | `/chat/stream/:conversationId` | Inicia um stream de eventos para a resposta da IA.  | Sim                      |
| `GET`       | `/conversations`               | Lista todas as conversas do usuário logado.         | Sim                      |
| `GET`       | `/conversations/:id/messages`  | Busca todas as mensagens de uma conversa.           | Sim                      |
| `DELETE`    | `/conversations/:id`           | Deleta uma conversa e suas mensagens.               | Sim                      |
