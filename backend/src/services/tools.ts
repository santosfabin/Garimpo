import * as tmdbService from './tmdbService';
import * as preferenceRepo from '../repository/preferenceRepository'; // Repositório para preferências

export class UnknownToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnknownToolError';
  }
}

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

// backend/src/services/tools.ts

export const discoverToolSchema = {
  type: 'function' as const,
  function: {
    name: 'discover_movies',
    description:
      'Descobre filmes com base em filtros avançados como gênero, ano, nota mínima, nota máxima e ordenação. Essencial para encontrar os "melhores" ou "piores" filmes.',
    parameters: {
      type: 'object' as const,
      properties: {
        genreName: {
          type: 'string' as const,
          description: 'O nome do gênero para filtrar, ex: "Ação", "Comédia".',
        },
        minRating: {
          type: 'number' as const,
          description: 'A nota média MÍNIMA que o filme deve ter (de 0 a 10).',
        },
        maxRating: {
          type: 'number' as const,
          description: 'A nota média MÁXIMA que o filme deve ter (de 0 a 10).',
        },
        year: {
          type: 'number' as const,
          description: 'O ano de lançamento do filme.',
        },
        sortBy: {
          type: 'string' as const,
          description:
            "Como ordenar os resultados. Use 'vote_average.desc' para os mais bem avaliados e 'vote_average.asc' para os piores avaliados.",
          enum: ['vote_average.desc', 'vote_average.asc'],
        },
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
          ],
        },
        value: { type: 'string', description: 'O valor da preferência (ex: "Ação", "Tom Hanks").' },
      },
      required: ['key', 'value'],
    },
  },
};
// Schema da ferramenta de filmografia
const getPersonFilmographySchema = {
  type: 'function' as const,
  function: {
    name: 'get_person_filmography',
    description: 'Busca os principais filmes de um determinado ator ou diretor.',
    parameters: {
      type: 'object' as const,
      properties: {
        personName: {
          type: 'string' as const,
          description:
            'O nome do ator ou diretor a ser buscado. Ex: "Tom Hanks", "Christopher Nolan".',
        },
      },
      required: ['personName'],
    },
  },
};

const removeUserPreferenceToolSchema = {
  type: 'function' as const,
  function: {
    name: 'remove_user_preference_item',
    description:
      "AÇÃO PRIORITÁRIA: Remove um item específico de QUALQUER lista de preferências, seja ela de favoritos ou não-favoritos. Use esta ferramenta SEMPRE que o usuário pedir para 'remover', 'tirar', 'retirar' ou indicar que não gosta mais de algo que já estava na lista. É mais importante remover do que adicionar à lista de 'não-gostos'.",
    parameters: {
      type: 'object' as const,
      properties: {
        key: {
          type: 'string',
          description: 'A categoria da qual a preferência será removida (ex: "favorite_actors").',
          enum: [
            'favorite_genres',
            'favorite_actors',
            'favorite_directors',
            'favorite_movies',
            'favorite_decades',
            'disliked_genres',
            'disliked_actors',
            'movie_moods',
          ],
        },
        value: { type: 'string', description: 'O valor exato a ser removido (ex: "Tom Hanks").' },
      },
      required: ['key', 'value'],
    },
  },
};

const nowPlayingToolSchema = {
  type: 'function' as const,
  function: {
    name: 'get_now_playing_movies',
    description:
      'Busca a lista de filmes que estão atualmente em cartaz nos cinemas. Use para perguntas como "o que está passando no cinema?" ou "quais os filmes mais recentes?".',
    parameters: { type: 'object' as const, properties: {}, required: [] },
  },
};

const popularToolSchema = {
  type: 'function' as const,
  function: {
    name: 'get_popular_movies',
    description:
      'Busca os filmes mais populares do momento. Use para perguntas como "quais os filmes do momento?" ou "me indique filmes populares".',
    parameters: { type: 'object' as const, properties: {}, required: [] },
  },
};

const topRatedToolSchema = {
  type: 'function' as const,
  function: {
    name: 'get_top_rated_movies',
    description:
      'Busca os filmes mais bem avaliados de todos os tempos. Use para perguntas sobre "os melhores filmes de todos os tempos" ou "filmes aclamados".',
    parameters: { type: 'object' as const, properties: {}, required: [] },
  },
};

const upcomingToolSchema = {
  type: 'function' as const,
  function: {
    name: 'get_upcoming_movies',
    description:
      'Busca a lista de filmes que serão lançados em breve. Use para perguntas sobre "próximos lançamentos", "o que vem por aí no cinema" ou quando o usuário pedir por filmes de um ano futuro (como 2025, 2026, etc.).',
    parameters: {
      type: 'object' as const,
      properties: {
        year: {
          type: 'number' as const,
          description: 'O ano específico para filtrar os lançamentos futuros. Ex: 2025.',
        },
      },
      required: [], // O ano é opcional, então required continua vazio
    },
  },
};
const getSimilarMoviesSchema = {
  type: 'function' as const,
  function: {
    name: 'get_similar_movies',
    description:
      'Encontra filmes similares a um filme específico que o usuário gostou. Ideal para "me recomende um filme parecido com...".',
    parameters: {
      type: 'object' as const,
      properties: {
        title: {
          type: 'string' as const,
          description: 'O título do filme base para a busca de similares.',
        },
      },
      required: ['title'],
    },
  },
};

const getMovieCastSchema = {
  type: 'function' as const,
  function: {
    name: 'get_movie_cast',
    description: 'Busca o elenco principal de um filme específico.',
    parameters: {
      type: 'object' as const,
      properties: {
        title: {
          type: 'string' as const,
          description: 'O título do filme para buscar o elenco.',
        },
      },
      required: ['title'],
    },
  },
};

const getWatchProvidersSchema = {
  type: 'function' as const,
  function: {
    name: 'get_watch_providers',
    description:
      'Verifica em quais serviços de streaming um filme está disponível para assistir no Brasil.',
    parameters: {
      type: 'object' as const,
      properties: {
        title: {
          type: 'string' as const,
          description: 'O título do filme para verificar a disponibilidade.',
        },
      },
      required: ['title'],
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
  getPersonFilmographySchema,
  removeUserPreferenceToolSchema,
  nowPlayingToolSchema,
  popularToolSchema,
  topRatedToolSchema,
  upcomingToolSchema,
  getSimilarMoviesSchema,
  getMovieCastSchema,
  getWatchProvidersSchema,
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

  get_person_filmography: async ({ toolArgs }) => {
    return tmdbService.getPersonFilmography(toolArgs.personName);
  },

  remove_user_preference_item: async ({ toolArgs, userId }) => {
    if (!userId) return 'Erro: Usuário não identificado.';
    return preferenceRepo.removePreference(userId, toolArgs.key, toolArgs.value);
  },

  get_now_playing_movies: async () => {
    return tmdbService.getNowPlayingMovies();
  },

  get_popular_movies: async () => {
    return tmdbService.getPopularMovies();
  },

  get_top_rated_movies: async () => {
    return tmdbService.getTopRatedMovies();
  },

  get_upcoming_movies: async ({ toolArgs }) => {
    return tmdbService.getUpcomingMovies(toolArgs.year);
  },

  get_similar_movies: async ({ toolArgs }) => {
    return tmdbService.getSimilarMovies(toolArgs.title);
  },

  get_movie_cast: async ({ toolArgs }) => {
    return tmdbService.getMovieCast(toolArgs.title);
  },

  get_watch_providers: async ({ toolArgs }) => {
    return tmdbService.getWatchProviders(toolArgs.title);
  },
};

// ==============================================================================
// ||                  3. FUNÇÃO ÚNICA DE ORQUESTRAÇÃO                         ||
// ==============================================================================
// Esta é a única função que o chatService vai chamar.

export const executeTool = (toolName: string, payload: ToolExecutorPayload): Promise<any> => {
  const executor = toolExecutors[toolName];
  if (!executor) {
    // É crucial que ele LANCE o erro aqui
    throw new UnknownToolError(
      `Erro: Ferramenta desconhecida ou sem executor definido: '${toolName}'.`
    );
  }
  return executor(payload);
};
