// ARQUIVO: /backend/src/services/tools.ts

import * as tmdbService from "./tmdbService";

// ===================================================================
// =================== DEFINIÇÃO DOS SCHEMAS =========================
// ===================================================================
// Cada vez que criar uma nova ferramenta, defina o schema dela aqui.

const searchToolSchema = {
  name: "search_movies_by_keyword",
  description:
    "Busca por filmes baseado em um gênero, ator, diretor ou palavra-chave.",
  parameters: {
    type: "object",
    properties: { query: { type: "string", description: "O termo de busca." } },
    required: ["query"],
  },
};

const detailsToolSchema = {
  name: "get_movie_details",
  description:
    "Busca informações detalhadas sobre um filme específico pelo título.",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string", description: "O título do filme." },
    },
    required: ["title"],
  },
};

const discoverToolSchema = {
  name: "discover_movies",
  description:
    "Descobre filmes com base em filtros como gênero, ano e nota mínima.",
  parameters: {
    type: "object",
    properties: {
      genreName: { type: "string" },
      minRating: { type: "number" },
      year: { type: "number" },
    },
    required: [],
  },
};

// ===================================================================
// ============== REGISTRO CENTRAL DE FERRAMENTAS ====================
// ===================================================================
// Este é o único lugar que você precisará modificar para adicionar novas ferramentas.

// 1. Mapeie o nome da ferramenta para sua função.
export const availableTools: { [key: string]: Function } = {
  search_movies_by_keyword: tmdbService.searchMoviesByKeyword,
  get_movie_details: tmdbService.getMovieDetails,
  discover_movies: tmdbService.discoverMovies,
  // Exemplo: se adicionar 'getTrending', a linha seria:
  // get_trending_movies: tmdbService.getTrendingMovies,
};

// 2. Agrupe os schemas para a IA.
export const toolSchemas = [
  { type: "function", function: searchToolSchema },
  { type: "function", function: detailsToolSchema },
  { type: "function", function: discoverToolSchema },
  // Exemplo: se adicionar 'getTrending', a linha seria:
  // { type: 'function', function: trendingToolSchema },
];
