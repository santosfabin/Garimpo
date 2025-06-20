import * as preferenceRepo from '../repository/preferenceRepository';

// Tipo para as chaves que são arrays na nossa interface
type PreferenceArrayKey =
  | 'favorite_genres'
  | 'favorite_actors'
  | 'favorite_directors'
  | 'favorite_movies'
  | 'favorite_decades'
  | 'disliked_genres'
  | 'disliked_actors'
  | 'movie_moods';

/**
 * Adiciona um novo item a uma lista de preferências do usuário (ex: 'favorite_actors').
 * Mantém a lista com no máximo 10 itens, removendo o mais antigo se o limite for excedido.
 * @param userId O ID do usuário.
 * @param key A chave da preferência a ser atualizada (ex: 'favorite_actors').
 * @param value O novo valor a ser adicionado (ex: 'Tom Cruise' ou um ID de filme).
 */
export const addPreferenceItem = async (
  userId: string,
  key: PreferenceArrayKey,
  value: string | number
) => {
  // 1. Busca as preferências atuais do usuário no banco de dados.
  const currentPrefs = (await preferenceRepo.getPreferencesByUserId(userId)) || {};

  // 2. Pega o array específico que queremos modificar. Se não existir, cria um vazio.
  const list: (string | number)[] = currentPrefs[key] || [];

  // 3. Adiciona o novo item no FINAL do array.
  list.push(value);

  // 4. Verifica se o limite de 10 itens foi ultrapassado.
  while (list.length > 10) {
    // Se ultrapassou, remove o PRIMEIRO item (o mais antigo) do array.
    list.shift();
  }

  // 5. Atualiza o objeto de preferências com a lista modificada.
  const newPrefs = {
    ...currentPrefs,
    [key]: list,
  };

  // 6. Salva o objeto de preferências completo de volta no banco.
  await preferenceRepo.upsertPreferences(userId, newPrefs);

  console.log(
    `[Service] Preferência '${key}' atualizada para o usuário ${userId}. Novo item: ${value}`
  );
  return { success: true, message: `Preferência '${key}' atualizada.` };
};

/**
 * Recupera todas as preferências de um usuário.
 * Ferramenta para a IA usar quando precisar de um contexto completo.
 */
// Renomeie a função para corresponder à ferramenta que vamos criar
export const getUserPreferences = async (userId: string): Promise<string> => {
  const prefs = await preferenceRepo.getPreferencesByUserId(userId);

  // Se não houver preferências, retorna uma mensagem clara.
  if (!prefs || Object.keys(prefs).length === 0) {
    return 'O usuário ainda não definiu nenhuma preferência. Você deve perguntar sobre seus gostos antes de fazer uma recomendação.';
  }

  // Se houver preferências, formata-as em uma string legível.
  let formattedPrefs = 'As preferências do usuário são:\n';
  if (prefs.favorite_genres?.length)
    formattedPrefs += `- Gêneros Favoritos: ${prefs.favorite_genres.join(', ')}\n`;
  if (prefs.favorite_actors?.length)
    formattedPrefs += `- Atores Favoritos: ${prefs.favorite_actors.join(', ')}\n`;
  if (prefs.favorite_movies?.length)
    formattedPrefs += `- IDs de Filmes Favoritos: ${prefs.favorite_movies.join(', ')}\n`;

  // Garante que não retorne uma string vazia se todos os campos estiverem vazios
  if (formattedPrefs === 'As preferências do usuário são:\n') {
    return 'O usuário tem um perfil de preferências criado, mas está vazio. Você deve perguntar sobre seus gostos.';
  }

  return formattedPrefs.trim();
};
