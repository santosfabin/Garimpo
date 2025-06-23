# Garimpo ⛏️

Bem-vindo ao Garimpo, uma aplicação full-stack que serve como um assistente de cinema inteligente. Converse com uma IA para encontrar recomendações de filmes, descobrir novas "pepitas" cinematográficas e obter detalhes sobre seus filmes favoritos.

O projeto é construído com um backend robusto em Node.js/Express e um frontend moderno em React/Vite, totalmente integrados para uma experiência de usuário fluida e em tempo real.

## Estrutura do Projeto

O repositório está organizado em duas pastas principais:

- `./frontend/`: Contém todo o código da aplicação React.
- `./backend/`: Contém todo o código da API Node.js, banco de dados e lógica da IA.

Para uma visão detalhada de cada parte, navegue até as respectivas pastas e consulte os seus `README.md`:

- **[Documentação do Backend](./backend/README.md)**
- **[Documentação do Frontend](./frontend/README.md)**

## Tecnologias Principais

- **Frontend:** React 19, Vite, TypeScript, React Router
- **Backend:** Node.js, Express, PostgreSQL, Docker, LangChain.js

## Como Executar o Projeto Completo (com Docker)

A maneira mais simples e recomendada de rodar a aplicação completa é utilizando Docker Compose, que orquestra tanto o banco de dados quanto o backend.

1.  **Clone o repositório:**

    ```bash
    git clone https://github.com/santosfabin/Garimpo.git
    cd Garimpo
    ```

2.  **Configure e Inicie o Backend e o Banco de Dados:**

    - Navegue até a pasta `backend`:
      ```bash
      cd backend
      ```
    - Copie o arquivo `.env.example` para um novo arquivo chamado `.env`:
      ```bash
      cp .env.example .env
      ```
    - Abra o arquivo `.env` recém-criado e preencha as seguintes chaves com seus próprios valores:
      - `SECRET_KEY`: Uma chave secreta longa e segura para assinar os tokens JWT.
      - `OPENAI_API_KEY`: Sua chave de API da OpenAI.
      - `TMDB_API_KEY`: Sua chave de API do The Movie Database.
    - Ainda na pasta `backend`, execute o Docker Compose para construir e iniciar os contêineres:
      ```bash
      docker-compose up --build
      ```
    - Isso irá construir a imagem do backend, iniciar o servidor na porta `7000` e um contêiner com o banco de dados PostgreSQL. O Docker se encarregará da rede entre os contêineres.

3.  **Inicie o Frontend:**

    - Abra um **novo terminal**.
    - Na raiz do projeto, navegue até a pasta `frontend`:
      ```bash
      cd frontend
      ```
    - Instale as dependências e inicie o servidor de desenvolvimento:
      ```bash
      npm install
      npm run dev
      ```

4.  **Acesse a Aplicação:**
    - O frontend estará disponível em `http://localhost:5173` (ou a porta indicada pelo Vite).
    - O backend estará rodando e acessível para o frontend em `http://localhost:7000`.

Agora você pode acessar a aplicação no seu navegador e começar a garimpar filmes!
