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
  maxRating,
  year,
  sortBy = 'vote_average.desc',
}: {
  genreName?: string;
  minRating?: number;
  maxRating?: number;
  year?: number;
  sortBy?: 'vote_average.desc' | 'vote_average.asc';
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
    if (maxRating) url += `&vote_average.lte=${maxRating}`;

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

/**
 * FERRAMENTA 4: Busca a filmografia de uma pessoa (ator ou diretor).
 * Primeiro, encontra o ID da pessoa pelo nome. Depois, busca os filmes
 * associados a esse ID.
 */
export const getPersonFilmography = async (personName: string): Promise<any> => {
  try {
    // Etapa 1: Buscar o ID da pessoa
    const searchUrl = `${BASE_URL}/search/person?query=${encodeURIComponent(
      personName
    )}&api_key=${API_KEY}`;
    const searchResponse = await fetch(searchUrl);
    const searchData: any = await searchResponse.json();

    if (searchData.results.length === 0) {
      return `Não consegui encontrar uma pessoa chamada "${personName}".`;
    }

    const personId = searchData.results[0].id;

    // Etapa 2: Usar o ID para buscar os créditos em filmes
    const filmographyUrl = `${BASE_URL}/person/${personId}/movie_credits?api_key=${API_KEY}`;
    const filmographyResponse = await fetch(filmographyUrl);
    const filmographyData: any = await filmographyResponse.json();

    // O TMDB retorna papéis de 'cast' (ator) e 'crew' (equipe, incluindo diretor)
    const filmography = [...filmographyData.cast, ...filmographyData.crew];

    if (filmography.length === 0) {
      return `Apesar de encontrar "${personName}", não achei nenhum filme associado.`;
    }

    // Ordena os filmes por popularidade (os mais relevantes primeiro) e remove duplicatas
    const uniqueFilms = Array.from(new Map(filmography.map(film => [film.id, film])).values());
    const sortedFilms = uniqueFilms.sort((a, b) => b.popularity - a.popularity);

    // Retorna os 10 filmes mais populares
    return sortedFilms.slice(0, 10).map((movie: any) => ({
      title: movie.title,
      release_date: movie.release_date,
      // Se for um ator, mostra o personagem. Se for da equipe, mostra o cargo.
      role: movie.character || movie.job,
    }));
  } catch (error) {
    console.error('Erro em getPersonFilmography:', error);
    return `Ocorreu um erro ao buscar a filmografia de "${personName}".`;
  }
};

/**
 * FERRAMENTA 5: Busca Filmes Atualmente em Cartaz.
 * Ideal para perguntas como "o que está passando no cinema?".
 */
export const getNowPlayingMovies = async (): Promise<any> => {
  try {
    const url = `${BASE_URL}/movie/now_playing?api_key=${API_KEY}&language=pt-BR®ion=BR`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Erro na API do TMDB: ${response.statusText}`);
    const data: any = await response.json();
    if (data.results.length === 0) return `Não encontrei nenhum filme em cartaz no momento.`;

    return data.results.slice(0, 5).map((movie: any) => ({
      id: movie.id,
      title: movie.title,
      overview: movie.overview,
      release_date: movie.release_date,
      vote_average: movie.vote_average,
    }));
  } catch (error) {
    console.error('Erro em getNowPlayingMovies:', error);
    return `Ocorreu um erro ao tentar buscar os filmes em cartaz.`;
  }
};

/**
 * FERRAMENTA 6: Busca os Filmes Mais Populares.
 * Ideal para perguntas como "quais os filmes do momento?" ou "me indique filmes populares".
 */
export const getPopularMovies = async (): Promise<any> => {
  try {
    const url = `${BASE_URL}/movie/popular?api_key=${API_KEY}&language=pt-BR®ion=BR`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Erro na API do TMDB: ${response.statusText}`);
    const data: any = await response.json();
    if (data.results.length === 0) return `Não encontrei filmes populares no momento.`;

    return data.results.slice(0, 5).map((movie: any) => ({
      id: movie.id,
      title: movie.title,
      overview: movie.overview,
      release_date: movie.release_date,
      vote_average: movie.vote_average,
    }));
  } catch (error) {
    console.error('Erro em getPopularMovies:', error);
    return `Ocorreu um erro ao tentar buscar os filmes populares.`;
  }
};

/**
 * FERRAMENTA 7: Busca os Filmes Mais Bem Avaliados.
 * Ideal para perguntas sobre "os melhores filmes de todos os tempos" ou "filmes aclamados pela crítica".
 */
export const getTopRatedMovies = async (): Promise<any> => {
  try {
    const url = `${BASE_URL}/movie/top_rated?api_key=${API_KEY}&language=pt-BR®ion=BR`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Erro na API do TMDB: ${response.statusText}`);
    const data: any = await response.json();
    if (data.results.length === 0)
      return `Não foi possível encontrar os filmes mais bem avaliados.`;

    return data.results.slice(0, 5).map((movie: any) => ({
      id: movie.id,
      title: movie.title,
      overview: movie.overview,
      release_date: movie.release_date,
      vote_average: movie.vote_average,
    }));
  } catch (error) {
    console.error('Erro em getTopRatedMovies:', error);
    return `Ocorreu um erro ao tentar buscar os filmes mais bem avaliados.`;
  }
};

/**
 * FERRAMENTA 8: Busca os Próximos Lançamentos.
 * Ideal para perguntas sobre "o que vem por aí no cinema" ou "próximos lançamentos".
 */
// No arquivo: backend/src/services/tmdbService.ts

export const getUpcomingMovies = async (targetYear?: number): Promise<any> => {
  try {
    const url = `${BASE_URL}/movie/upcoming?api_key=${API_KEY}&language=pt-BR®ion=BR`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Erro na API do TMDB: ${response.statusText}`);

    const data: any = await response.json();
    let results = data.results;

    // Se um ano específico foi fornecido, filtramos os resultados ANTES de enviar para a IA.
    if (targetYear) {
      console.log(`[tmdbService] Filtrando próximos lançamentos para o ano de ${targetYear}...`);
      results = results.filter((movie: any) => {
        // Garante que a data de lançamento existe antes de tentar criar um objeto Date
        if (movie.release_date) {
          const releaseYear = new Date(movie.release_date).getFullYear();
          return releaseYear === targetYear;
        }
        return false;
      });
    }

    if (results.length === 0) {
      if (targetYear) {
        return `Não encontrei informações sobre lançamentos para o ano de ${targetYear}.`;
      }
      return `Não encontrei informações sobre os próximos lançamentos.`;
    }

    return results.slice(0, 10).map((movie: any) => ({
      // Aumentei para 10 para dar mais opções
      id: movie.id,
      title: movie.title,
      overview: movie.overview,
      release_date: movie.release_date,
      vote_average: movie.vote_average,
    }));
  } catch (error) {
    console.error('Erro em getUpcomingMovies:', error);
    return `Ocorreu um erro ao tentar buscar os próximos lançamentos.`;
  }
};
