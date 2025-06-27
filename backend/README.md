# Backend - Garimpo ⛏️

Este é o backend da aplicação Garimpo. Ele serve como o cérebro do sistema, responsável por:

- Gerenciamento de usuários (cadastro, login, autenticação).
- Persistência de conversas, mensagens e preferências de usuário em um banco de dados PostgreSQL.
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

2. **Configure o `.env`:**

   - Copie o arquivo `.env.example` para `.env`:
     ```bash
     cp .env.example .env
     ```
   - Edite o arquivo `.env` e preencha suas chaves `SECRET_KEY`, `OPENAI_API_KEY` e `TMDB_API_KEY`.

3. **Inicie os contêineres:**

   - O comando `-d` (detached) executa os contêineres em segundo plano:
     ```bash
     docker compose up --build -d
     ```
   - Aguarde alguns segundos para o serviço `db` iniciar completamente.

   - Para ver os logs do backend, use este comando:
     ```bash
     docker compose logs -f backend-web
     ```

4. **Crie as tabelas no banco de dados:**

   - Para interagir com o banco de dados dentro do contêiner, abra um terminal `psql`:

     ```bash
     docker compose exec db psql -U meuuser -d meubanco
     ```

   - Com o terminal `psql` aberto, copie e cole os blocos de código SQL abaixo **um por um**, para criar a estrutura do banco.

   - **Extensão para UUIDs:**

     ```sql
     CREATE EXTENSION IF NOT EXISTS "pgcrypto";
     ```

   - **Tabela de Usuários:**

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

   - **Tipo para Remetente:**

     ```sql
     CREATE TYPE sender_type AS ENUM ('user', 'ai');
     ```

   - **Tabela de Conversas:**

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

   - **Tabela de Mensagens:**

     ```sql
     CREATE TABLE messages (
         id BIGSERIAL PRIMARY KEY,
         conversation_id UUID NOT NULL,
         sender sender_type NOT NULL,
         message_text TEXT NOT NULL,
         thought_log JSONB NULL,
         timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
         CONSTRAINT fk_conversation
             FOREIGN KEY(conversation_id)
             REFERENCES conversations(id)
             ON DELETE CASCADE
     );
     ```

   - **Tabela de Preferências do Usuário:**

     ```sql
     CREATE TABLE user_preferences (
         user_id UUID PRIMARY KEY,
         favorite_genres TEXT[] DEFAULT ARRAY[]::TEXT[],
         favorite_actors TEXT[] DEFAULT ARRAY[]::TEXT[],
         favorite_directors TEXT[] DEFAULT ARRAY[]::TEXT[],
         favorite_movies TEXT[] DEFAULT ARRAY[]::TEXT[],
         favorite_decades TEXT[] DEFAULT ARRAY[]::TEXT[],
         disliked_genres TEXT[] DEFAULT ARRAY[]::TEXT[],
         disliked_actors TEXT[] DEFAULT ARRAY[]::TEXT[],
         movie_moods TEXT[] DEFAULT ARRAY[]::TEXT[],
         updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
         CONSTRAINT fk_user
             FOREIGN KEY(user_id)
             REFERENCES users(id)
             ON DELETE CASCADE
     );
     ```

   - **Função para atualizar o timestamp automaticamente:**

     ```sql
     DROP FUNCTION IF EXISTS update_timestamp_column();

     CREATE OR REPLACE FUNCTION update_timestamp_column()
     RETURNS TRIGGER AS $$
     BEGIN
         NEW.updated_at = NOW();
         RETURN NEW;
     END;
     $$ LANGUAGE 'plpgsql';
     ```

   - **Gatilho para atualização automática do campo `updated_at`:**

     ```sql
     CREATE TRIGGER update_user_preferences_updated_at
     BEFORE UPDATE ON user_preferences
     FOR EACH ROW
     EXECUTE FUNCTION update_timestamp_column();
     ```

   - Após executar todos os comandos, digite `\q` e pressione Enter para sair do `psql`. O seu banco de dados estará pronto.

## Estrutura de Pastas (`/src`)

- **`routes/`**: Define os endpoints da API.
- **`controller/`**: Camada responsável por receber as requisições HTTP e enviar as respostas.
- **`services/`**: Contém a lógica de negócio principal.
- **`repository/`**: Camada de acesso a dados, abstraindo a comunicação com o banco.
- **`database/`**: Configuração da conexão e scripts de criação das tabelas.
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
