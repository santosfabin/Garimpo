// src/services/tools.ts

import * as tmdbService from './tmdbService';
import * as preferenceRepo from '../repository/preferenceRepository'; // Repositório para preferências

// ==============================================================================
// ||                    1. DEFINIÇÃO DOS SCHEMAS (INPUTS)                     ||
// ==============================================================================
// Descreve para a IA como cada ferramenta deve ser chamada.

const searchToolSchema = {
  type: 'function' as const,
  function: {
    name: 'search_movies_by_keyword',
    description: 'Busca por filmes baseado em um gênero, ator, diretor ou palavra-chave.',
    parameters: {
      type: 'object' as const,
      properties: { query: { type: 'string', description: 'O termo de busca em inglês.' } },
      required: ['query'],
    },
  },
};

const detailsToolSchema = {
  type: 'function' as const,
  function: {
    name: 'get_movie_details',
    description: 'Busca informações detalhadas sobre um filme específico pelo título.',
    parameters: {
      type: 'object' as const,
      properties: { title: { type: 'string', description: 'O título do filme em inglês.' } },
      required: ['title'],
    },
  },
};

const discoverToolSchema = {
  type: 'function' as const,
  function: {
    name: 'discover_movies',
    description: 'Descobre filmes com base em filtros como gênero, ano e nota mínima.',
    parameters: {
      type: 'object' as const,
      properties: {
        genreName: { type: 'string', description: 'O nome do gênero em inglês.' },
        minRating: { type: 'number' },
        year: { type: 'number' },
      },
      required: [],
    },
  },
};

const addUserPreferenceToolSchema = {
  type: 'function' as const,
  function: {
    name: 'add_user_preference_item',
    description:
      'Salva uma preferência do usuário, como gênero, ator ou diretor favorito. Use para pedidos como "meu ator favorito é..." ou "gosto de filmes de comédia".',
    parameters: {
      type: 'object' as const,
      properties: {
        key: {
          type: 'string',
          description: 'A categoria da preferência. Deve ser uma das opções disponíveis.',
          enum: [
            'favorite_genres',
            'favorite_actors',
            'favorite_directors',
            'favorite_movies',
            'favorite_decades',
            'disliked_genres',
            'disliked_actors',
            'movie_moods',
            'other_notes',
          ],
        },
        value: { type: 'string', description: 'O valor da preferência (ex: "Ação", "Tom Hanks").' },
      },
      required: ['key', 'value'],
    },
  },
};

// Lista de schemas que será exportada e usada pelo LLM.
// Para adicionar uma nova ferramenta para a IA, adicione seu schema aqui.
export const toolSchemas = [
  searchToolSchema,
  detailsToolSchema,
  discoverToolSchema,
  addUserPreferenceToolSchema,
];

// ==============================================================================
// ||                   2. LÓGICA DE EXECUÇÃO (O CÉREBRO)                      ||
// ==============================================================================
// Um mapa que conecta o nome da ferramenta à sua função de execução.

interface ToolExecutorPayload {
  toolArgs: any;
  userId?: string;
}

const toolExecutors: { [key: string]: (payload: ToolExecutorPayload) => Promise<any> } = {
  search_movies_by_keyword: async ({ toolArgs }) => {
    return tmdbService.searchMoviesByKeyword(toolArgs.query);
  },

  get_movie_details: async ({ toolArgs }) => {
    return tmdbService.getMovieDetails(toolArgs.title);
  },

  discover_movies: async ({ toolArgs }) => {
    return tmdbService.discoverMovies(toolArgs);
  },

  add_user_preference_item: async ({ toolArgs, userId }) => {
    if (!userId) {
      return 'Erro: Não consigo salvar a preferência pois não sei quem é o usuário.';
    }
    // A função no repositório agora só precisa da chave, valor e ID do usuário.
    return preferenceRepo.addPreference(userId, toolArgs.key, toolArgs.value);
  },

  // Para adicionar uma nova ferramenta, adicione sua função de execução aqui.
};

// ==============================================================================
// ||                  3. FUNÇÃO ÚNICA DE ORQUESTRAÇÃO                         ||
// ==============================================================================
// Esta é a única função que o chatService vai chamar.

export const executeTool = (toolName: string, payload: ToolExecutorPayload): Promise<any> => {
  const executor = toolExecutors[toolName];
  if (!executor) {
    return Promise.resolve(
      `Erro: Ferramenta desconhecida ou sem executor definido: '${toolName}'.`
    );
  }
  return executor(payload);
};
