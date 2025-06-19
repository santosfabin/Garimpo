import fetch from 'node-fetch';
import config from '../config';

const BASE_URL = 'https://api.themoviedb.org/3';
const API_KEY = config.TMDB_API_KEY;

let genreMap: Map<string, number> | null = null;

/**
 * Busca e armazena em cache o mapa de 'nome do gênero' -> 'ID do gênero'.
 * A API do TMDB usa IDs para filtrar por gênero, então esta função é essencial
 * para traduzir o que o usuário pede (ex: "comédia") para o que a API entende (ex: 35).
 */
const getGenreMap = async (): Promise<Map<string, number>> => {
  if (genreMap) {
    return genreMap;
  }

  console.log('[tmdbService] Buscando e cacheando mapa de gêneros...');
  const url = `${BASE_URL}/genre/movie/list?api_key=${API_KEY}&language=pt-BR`;
  const response = await fetch(url);
  const data: any = await response.json();

  const newMap = new Map<string, number>();
  data.genres.forEach((genre: { id: number; name: string }) => {
    newMap.set(genre.name.toLowerCase(), genre.id);
  });

  genreMap = newMap;
  return genreMap;
};

// ==============================================================================
// ||                     INÍCIO DAS FUNÇÕES-FERRAMENTA PARA IA                  ||
// ==============================================================================

/**
 * FERRAMENTA 1: Busca de Filmes por Palavra-Chave.
 * Esta função atua como uma ferramenta que a IA pode invocar. Ela busca
 * filmes na API do TMDB baseando-se em um termo de busca genérico.
 */
export const searchMoviesByKeyword = async (keyword: string): Promise<any> => {
  try {
    const url = `${BASE_URL}/search/movie?query=${encodeURIComponent(keyword)}&api_key=${API_KEY}`;

    console.log(`[TMDB Service] Buscando com a URL: ${url}`);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Erro na API do TMDB: ${response.statusText}`);
    }
    const data: any = await response.json();

    if (data.results.length === 0) {
      return `Nenhum filme encontrado para o termo "${keyword}".`;
    }

    return data.results.slice(0, 5).map((movie: any) => ({
      id: movie.id,
      title: movie.title,
      overview: movie.overview,
      release_date: movie.release_date,
      vote_average: movie.vote_average,
    }));
  } catch (error) {
    console.error('Erro em searchMoviesByKeyword:', error);
    return `Ocorreu um erro ao tentar buscar filmes com o termo "${keyword}".`;
  }
};

/**
 * FERRAMENTA 2: Busca Detalhes de um Filme Específico.
 * Esta ferramenta primeiro encontra o ID de um filme pelo título e depois busca
 * os detalhes completos, como elenco e equipe, usando esse ID.
 */
export const getMovieDetails = async (title: string): Promise<any> => {
  try {
    const searchUrl = `${BASE_URL}/search/movie?query=${encodeURIComponent(
      title
    )}&api_key=${API_KEY}&language=pt-BR`;
    const searchResponse = await fetch(searchUrl);
    const searchData: any = await searchResponse.json();

    console.log('[DEBUG] A ORDENAÇÃO POR POPULARIDADE ESTÁ SENDO EXECUTADA!');

    if (!searchData.results || searchData.results.length === 0) {
      return `Não consegui encontrar um filme chamado "${title}". Tem certeza que o nome está correto?`;
    }

    // Ordena os resultados pela popularidade (do maior para o menor)
    const sortedResults = searchData.results.sort((a: any, b: any) => b.popularity - a.popularity);

    // Pega o ID do filme mais popular, que é o resultado mais confiável
    const movieId = sortedResults[0].id;

    const detailsUrl = `${BASE_URL}/movie/${movieId}?append_to_response=credits&api_key=${API_KEY}&language=pt-BR`;
    const detailsResponse = await fetch(detailsUrl);
    const detailsData: any = await detailsResponse.json();

    return {
      title: detailsData.title,
      overview: detailsData.overview,
      release_date: detailsData.release_date,
      vote_average: detailsData.vote_average,
      genres: detailsData.genres.map((g: any) => g.name),
      director:
        detailsData.credits.crew.find((p: any) => p.job === 'Director')?.name || 'Não encontrado',
      cast: detailsData.credits.cast.slice(0, 5).map((a: any) => a.name),
    };
  } catch (error) {
    console.error('Erro em getMovieDetails:', error);
    return `Ocorreu um erro ao buscar detalhes do filme "${title}".`;
  }
};

/**
 * FERRAMENTA 3: Descobrir Filmes com Filtros Avançados.
 * Permite encontrar filmes com base em critérios como gênero, ano e nota mínima.
 * Responde a perguntas como "filmes de comédia bem avaliados de 2022".
 */
export const discoverMovies = async ({
  genreName,
  minRating,
  maxRating, // <-- NOVO PARÂMETRO
  year,
  sortBy = 'vote_average.desc', // <-- NOVO PARÂMETRO com valor padrão
}: {
  genreName?: string;
  minRating?: number;
  maxRating?: number; // <-- NOVO
  year?: number;
  sortBy?: 'vote_average.desc' | 'vote_average.asc'; // <-- NOVO
}): Promise<any> => {
  try {
    const genres = await getGenreMap();
    let genreId: number | undefined;

    if (genreName) {
      genreId = genres.get(genreName.toLowerCase());
    }

    // A URL base agora usa o sortBy dinâmico
    let url = `${BASE_URL}/discover/movie?api_key=${API_KEY}&sort_by=${sortBy}&vote_count.gte=100`;

    if (year) url += `&primary_release_year=${year}`;
    if (genreId) url += `&with_genres=${genreId}`;
    if (minRating) url += `&vote_average.gte=${minRating}`;
    if (maxRating) url += `&vote_average.lte=${maxRating}`; // <-- NOVO FILTRO

    const response = await fetch(url);
    const data: any = await response.json();

    if (data.results.length === 0) {
      return `Não encontrei nenhuma pepita com os critérios fornecidos. Tente uma busca mais ampla!`;
    }

    return data.results.slice(0, 5).map((movie: any) => ({
      id: movie.id,
      title: movie.title,
      overview: movie.overview,
      release_date: movie.release_date,
      vote_average: movie.vote_average,
    }));
  } catch (error) {
    console.error('Erro em discoverMovies:', error);
    return `Ocorreu um erro ao tentar descobrir filmes com os filtros fornecidos.`;
  }
};

// ==============================================================================
// ||                      FIM DAS FUNÇÕES-FERRAMENTA PARA IA                    ||
// ==============================================================================
