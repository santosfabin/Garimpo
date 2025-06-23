# Garimpo ⛏️

Bem-vindo ao **Garimpo**, uma aplicação full-stack que serve como um assistente de cinema inteligente.  
Converse com uma IA para encontrar recomendações de filmes, descobrir novas _pepitas_ cinematográficas e obter detalhes sobre seus filmes favoritos.

O projeto é construído com um backend robusto em **Node.js/Express** e um frontend moderno em **React/Vite**, totalmente integrados para uma experiência de usuário fluida e em tempo real.

---

## 📁 Estrutura do Projeto

O repositório está organizado em duas pastas principais:

- `./frontend/`: Contém todo o código da aplicação React.
- `./backend/`: Contém todo o código da API Node.js, banco de dados e lógica da IA.

Para uma visão detalhada de cada parte, navegue até as respectivas pastas e consulte os seus `README.md`:

- [Documentação do Backend](./backend/)
- [Documentação do Frontend](./frontend/)

---

## 🧠 Desenvolvimento, Tecnologias e Desafios

###  Arquitetura e Fluxo de Desenvolvimento

- **Comunicação em Tempo Real**  
  Operações como login e gerenciamento de conversas usam uma API REST.  
  Já o chat utiliza **Server-Sent Events (SSE)**, permitindo respostas contínuas em tempo real, onde o usuário vê o texto se formando ao vivo.

- **Lógica de Agente Inteligente**  
  O sistema implementa um agente com múltiplos turnos, permitindo que a IA raciocine sobre quais ferramentas usar e analise os resultados antes de formular a resposta final.

---

## 🧰 Tecnologias Utilizadas

### Inteligência Artificial e Integrações

- **[OpenAI (GPT-4o)](https://openai.com/gpt-4o)** – Cérebro da aplicação.
- **[LangChain.js](https://js.langchain.com/)** – Orquestração do agente e uso de ferramentas externas.
- **[TMDB API](https://developer.themoviedb.org/docs)** – Fonte de dados sobre filmes, gêneros e elenco.

### Backend

- **Node.js + Express** – API REST e servidor SSE.
- **TypeScript** – Tipagem estática.
- **PostgreSQL** – Banco de dados relacional.

### Frontend

- **React** – Construção da interface.
- **Vite** – Build moderno com HMR.
- **React Router** – Navegação SPA.

### Ambiente e Orquestração

- **Docker + Docker Compose** – Setup padronizado e simples.

---

## 🚧 Principais Desafios Enfrentados

### 1. Gerenciamento do Ciclo de Vida da Resposta

**Desafio**: A IA pode precisar de múltiplos passos (pensar, agir).  
**Solução**: Foi implementado um motor de agente em turnos, que espera a execução completa das ferramentas antes de chamar a IA novamente.

### 2. Construção Confiável das Chamadas de Ferramenta

**Desafio**: As decisões da IA chegam em partes fragmentadas via SSE.  
**Solução**: Criou-se uma estrutura temporária que acumula esses fragmentos até que o turno esteja completo, garantindo dados válidos e completos para cada ferramenta.

---

## 🚀 Como Executar o Projeto Completo (com Docker)

### 1. Clone o Repositório

```bash
git clone https://github.com/santosfabin/Garimpo.git
cd Garimpo
```

---

### 2. Configure e Inicie o Backend e Banco de Dados

```bash
cd backend
cp .env.example .env
```

Abra o `.env` e preencha com seus dados:

- `SECRET_KEY`: Uma chave JWT segura
- `OPENAI_API_KEY`: Sua chave da OpenAI
- `TMDB_API_KEY`: Sua chave do The Movie Database

Inicie os contêineres:

```bash
docker compose up --build
```

> 💡 Após subir os contêineres, é necessário **criar as tabelas do banco de dados**.  
> Siga o passo 4 da [documentação do backend](./backend) para executar os comandos SQL no PostgreSQL.

---

### 3. Inicie o Frontend

Em outro terminal:

```bash
cd frontend
npm install
npm run dev
```

---

### 4. Acesse a Aplicação

- Frontend: [http://localhost:5173](http://localhost:5173)
- Backend: [http://localhost:7000](http://localhost:7000)

Agora você pode abrir o navegador e começar a **garimpar filmes** com o Garimpo! 🎬✨
