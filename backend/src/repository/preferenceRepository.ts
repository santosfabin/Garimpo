import pool from '../database/connection';

/**
 * Adiciona ou atualiza uma preferência de usuário.
 * Esta função usa a cláusula ON CONFLICT do PostgreSQL para criar uma nova
 * linha de preferência se não existir, ou atualizar os arrays se já existir.
 * @param userId - O ID do usuário.
 * @param key - A coluna a ser atualizada ('favorite_genres', 'favorite_actors', etc.).
 * @param value - O valor a ser adicionado ao array (ex: 'Ação', 'Tom Hanks').
 * @returns Um objeto de sucesso ou lança um erro.
 */

export const addPreference = async (userId: string, key: string, value: string) => {
  // Validação para garantir que a 'key' seja uma das colunas permitidas, prevenindo SQL Injection.
  const allowedKeys = [
    'favorite_genres',
    'favorite_actors',
    'favorite_directors',
    'favorite_movies',
    'favorite_decades',
    'disliked_genres',
    'disliked_actors',
    'movie_moods',
    'other_notes',
  ];
  if (!allowedKeys.includes(key)) {
    throw new Error(`Chave de preferência inválida: ${key}`);
  }

  try {
    const query = `
      INSERT INTO user_preferences (user_id, ${key})
      VALUES ($1, ARRAY[$2])
      ON CONFLICT (user_id)
      DO UPDATE SET
        ${key} = array_append(
          COALESCE(user_preferences.${key}, ARRAY[]::TEXT[]),
          $2
        )
      WHERE user_preferences.${key} IS NULL OR NOT (user_preferences.${key} @> ARRAY[$2]);
    `;
    // COALESCE: Trata o caso de a coluna ser nula, começando com um array vazio.
    // array_append: Adiciona o novo valor ao array existente.
    // WHERE NOT: Impede a adição de valores duplicados no array.
    // Adicionado `user_preferences.${key} IS NULL` para garantir que a atualização ocorra se o array for nulo.

    await pool.query(query, [userId, value]);

    console.log(
      `[Repo] Preferência '${value}' adicionada para a chave '${key}' do usuário ${userId}.`
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
    'other_notes',
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
    'other_notes',
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
