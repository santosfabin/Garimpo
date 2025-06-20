import pool from '../database/connection';

/**
 * Adiciona ou atualiza uma preferência de usuário, modificando a função original do usuário.
 * 1. Valida a 'key' contra uma lista de chaves permitidas.
 * 2. Remove o valor da própria coluna (para evitar duplicatas e movê-lo para o final).
 * 3. Remove o valor da coluna oposta (se existir).
 * 4. Adiciona o valor à coluna correta.
 * Tudo isso em uma única operação atômica no banco de dados.
 *
 * @param userId O ID do usuário.
 * @param key A coluna de preferência (ex: 'favorite_genres').
 * @param value O valor a ser adicionado (ex: 'Terror').
 */
export const addPreference = async (userId: string, key: string, value: string) => {
  // SEU CÓDIGO DE VALIDAÇÃO, MANTIDO INTEGRALMENTE
  const allowedKeys = [
    'favorite_genres',
    'favorite_actors',
    'favorite_directors',
    'favorite_movies',
    'favorite_decades',
    'disliked_genres',
    'disliked_actors',
    'movie_moods',
  ];
  if (!allowedKeys.includes(key)) {
    throw new Error(`Chave de preferência inválida: ${key}`);
  }

  // Mapa para definir as colunas opostas
  const oppositeKeyMap: { [key: string]: string | undefined } = {
    favorite_genres: 'disliked_genres',
    disliked_genres: 'favorite_genres',
    favorite_actors: 'disliked_actors',
    disliked_actors: 'favorite_actors',
  };

  const oppositeKey = oppositeKeyMap[key];

  // Constrói a cláusula SET para a query
  const setClauses: string[] = [];

  // 1. Cláusula para a coluna principal (key): remove o valor e depois o adiciona.
  // Isso substitui a sua cláusula WHERE, pois já garante que não haverá duplicatas
  // e sempre coloca o item no final.
  setClauses.push(
    `${key} = array_append(array_remove(COALESCE(user_preferences.${key}, ARRAY[]::TEXT[]), $2), $2)`
  );

  // 2. Se houver uma chave oposta, adiciona a cláusula para remover o valor dela.
  if (oppositeKey) {
    setClauses.push(
      `${oppositeKey} = array_remove(COALESCE(user_preferences.${oppositeKey}, ARRAY[]::TEXT[]), $2)`
    );
  }

  const setClauseString = setClauses.join(', ');

  try {
    // SUA ESTRUTURA DE QUERY, MODIFICADA APENAS NA CLÁUSULA SET
    // A cláusula WHERE foi removida porque a nova cláusula SET já lida com duplicatas.
    const query = `
      INSERT INTO user_preferences (user_id, ${key})
      VALUES ($1, ARRAY[$2])
      ON CONFLICT (user_id)
      DO UPDATE SET
        ${setClauseString};
    `;

    await pool.query(query, [userId, value]);

    console.log(
      `[Repo] Preferência '${value}' adicionada/atualizada para a chave '${key}' do usuário ${userId}.`
    );
    return { success: true, message: `Preferência '${value}' salva!` };
  } catch (error) {
    console.error('Erro ao adicionar preferência no repositório:', error);
    throw new Error('Não foi possível salvar a preferência.');
  }
};

/**
 * Busca todas as preferências de um usuário.
 * @param userId - O ID do usuário.
 * @returns Um objeto com as preferências ou null se não houver.
 */
export const getPreferencesByUserId = async (userId: string) => {
  try {
    const query = 'SELECT * FROM user_preferences WHERE user_id = $1';
    const { rows } = await pool.query(query, [userId]);

    if (rows.length === 0) {
      return null;
    }

    const prefs = rows[0];
    delete prefs.user_id;

    return prefs;
  } catch (error) {
    console.error('Erro ao buscar preferências do usuário:', error);
    throw new Error('Não foi possível carregar as preferências.');
  }
};

export const upsertPreferences = async (userId: string, preferences: Record<string, any>) => {
  // Validação básica: garantir que as chaves são permitidas
  const allowedKeys = [
    'favorite_genres',
    'favorite_actors',
    'favorite_directors',
    'favorite_movies',
    'favorite_decades',
    'disliked_genres',
    'disliked_actors',
    'movie_moods',
  ];

  const keys = Object.keys(preferences).filter(key => allowedKeys.includes(key));
  if (keys.length === 0) {
    throw new Error('Nenhuma chave válida para atualizar');
  }

  // Montar a query dinâmica para atualizar as colunas recebidas
  const setClauses = keys.map((key, idx) => `${key} = EXCLUDED.${key}`).join(', ');

  // Preparar os valores para o INSERT
  const columns = ['user_id', ...keys].join(', ');
  const valuesPlaceholders = ['$1', ...keys.map((_, i) => `$${i + 2}`)].join(', ');
  const values = [userId, ...keys.map(key => preferences[key])];

  const query = `
    INSERT INTO user_preferences (${columns})
    VALUES (${valuesPlaceholders})
    ON CONFLICT (user_id) DO UPDATE SET
      ${setClauses}
  `;

  try {
    await pool.query(query, values);
    return { success: true };
  } catch (error) {
    console.error('Erro no upsertPreferences:', error);
    throw new Error('Não foi possível atualizar preferências');
  }
};

/**
 * Remove um item específico de uma lista de preferências do usuário.
 * @param userId - O ID do usuário.
 * @param key - A coluna da qual o valor será removido.
 * @param value - O valor a ser removido do array (ex: 'Ação', 'Tom Hanks').
 * @returns Um objeto de sucesso ou lança um erro.
 */
export const removePreference = async (userId: string, key: string, value: string) => {
  // Reutiliza a mesma validação para garantir a segurança da query
  const allowedKeys = [
    'favorite_genres',
    'favorite_actors',
    'favorite_directors',
    'favorite_movies',
    'favorite_decades',
    'disliked_genres',
    'disliked_actors',
    'movie_moods',
  ];
  if (!allowedKeys.includes(key)) {
    throw new Error(`Chave de preferência inválida para remoção: ${key}`);
  }

  try {
    const query = `
      UPDATE user_preferences
      SET ${key} = array_remove(user_preferences.${key}, $2)
      WHERE user_id = $1;
    `;
    // array_remove: Remove todas as ocorrências do valor ($2) do array especificado.

    await pool.query(query, [userId, value]);

    console.log(`[Repo] Preferência '${value}' removida da chave '${key}' do usuário ${userId}.`);
    return { success: true, message: `Preferência '${value}' removida!` };
  } catch (error) {
    console.error('Erro ao remover preferência no repositório:', error);
    throw new Error('Não foi possível remover a preferência.');
  }
};
