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

// Lista de schemas que será exportada e usada pelo LLM.
// Para adicionar uma nova ferramenta para a IA, adicione seu schema aqui.
export const toolSchemas = [
  searchToolSchema,
  detailsToolSchema,
  discoverToolSchema,
  addUserPreferenceToolSchema,
  getPersonFilmographySchema,
  removeUserPreferenceToolSchema,
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
