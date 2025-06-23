import pool from '../database/connection';
import { PoolClient } from 'pg';
import { HumanMessage, AIMessage } from '@langchain/core/messages';

/**
 * Cria uma nova conversa no banco de dados para um usuário específico.
 * @param userId - O ID (UUID) do usuário que está iniciando a conversa.
 * @param title - Um título para a conversa, geralmente gerado pela IA.
 * @returns O objeto da conversa recém-criada, incluindo seu novo ID.
 * @throws Lança um erro se a inserção no banco de dados falhar.
 */
export const createConversation = async (userId: string, title: string) => {
  try {
    const query = `
      INSERT INTO conversations (user_id, title) 
      VALUES ($1, $2) 
      RETURNING *;
    `;
    const { rows } = await pool.query(query, [userId, title]);
    console.log(`[Repo] Conversa criada com ID: ${rows[0].id}`);
    return rows[0];
  } catch (error) {
    console.error('Erro ao criar conversa no repositório:', error);
    throw new Error('Não foi possível iniciar uma nova conversa.');
  }
};

/**
 * Adiciona uma nova mensagem a uma conversa existente e atualiza o timestamp da conversa.
 * Realiza as duas operações (UPDATE e INSERT) dentro de uma transação para garantir a consistência dos dados.
 * @param conversationId - O ID da conversa onde a mensagem será adicionada.
 * @param sender - Quem enviou a mensagem ('user' ou 'ai').
 * @param text - O conteúdo textual da mensagem (pode ser uma string JSON para respostas estruturadas).
 * @param thoughtLog - (Opcional) O log de pensamento da IA, armazenado como um objeto JSON.
 * @throws Lança um erro se a transação falhar, revertendo todas as alterações.
 */
export const addMessage = async (
  conversationId: string,
  sender: 'user' | 'ai',
  text: string,
  thoughtLog: object | null = null
) => {
  const client: PoolClient = await pool.connect();
  try {
    // Inicia uma transação. Se qualquer comando falhar, nada é salvo.
    await client.query('BEGIN');

    // 1. Atualiza o 'updated_at' da conversa para que ela apareça no topo da lista.
    const updateQuery = `UPDATE conversations SET updated_at = NOW() WHERE id = $1;`;
    await client.query(updateQuery, [conversationId]);

    // 2. Insere a nova mensagem na tabela 'messages'.
    const insertQuery = `
      INSERT INTO messages (conversation_id, sender, message_text, thought_log) 
      VALUES ($1, $2, $3, $4);
    `;
    // Converte o thoughtLog para uma string JSON se ele existir, senão insere NULL.
    const values = [conversationId, sender, text, thoughtLog ? JSON.stringify(thoughtLog) : null];
    await client.query(insertQuery, values);

    // Confirma que todas as operações da transação foram bem-sucedidas.
    await client.query('COMMIT');
    console.log(
      `[Repo] Mensagem do tipo '${sender}' adicionada e conversa ${conversationId} atualizada.`
    );
  } catch (error) {
    // Se ocorrer qualquer erro, desfaz todas as operações da transação.
    await client.query('ROLLBACK');
    console.error('Erro ao adicionar mensagem no repositório:', error);
    throw new Error('Não foi possível salvar a mensagem.');
  } finally {
    // Libera o cliente de volta para o pool de conexões, seja em caso de sucesso ou erro.
    client.release();
  }
};

/**
 * Busca o ID do usuário que é o "dono" de uma conversa.
 * É uma função de segurança crucial para garantir que um usuário não acesse conversas de outro.
 * @param conversationId - O ID da conversa a ser verificada.
 * @returns O ID do usuário (UUID) ou `null` se a conversa não for encontrada.
 * @throws Lança um erro se a consulta ao banco de dados falhar.
 */
export const getConversationOwner = async (conversationId: string): Promise<string | null> => {
  try {
    const query = `SELECT user_id FROM conversations WHERE id = $1;`;
    const { rows } = await pool.query(query, [conversationId]);

    if (rows.length === 0) {
      return null;
    }
    return rows[0].user_id;
  } catch (error) {
    console.error('Erro ao buscar dono da conversa:', error);
    throw new Error('Não foi possível verificar a propriedade da conversa.');
  }
};

/**
 * Recupera o histórico de mensagens de uma conversa para dar contexto ao LLM.
 * Esta função seleciona apenas os campos necessários para o LangChain e os formata
 * nos objetos `HumanMessage` e `AIMessage` que o modelo de IA entende.
 * @param conversationId - O ID da conversa a ser recuperada.
 * @returns Um array de mensagens formatadas para o LangChain.
 * @throws Lança um erro se a consulta ao banco de dados falhar.
 */
export const getHistory = async (conversationId: string): Promise<(HumanMessage | AIMessage)[]> => {
  try {
    const query = `
      SELECT sender, message_text 
      FROM messages 
      WHERE conversation_id = $1 
      ORDER BY timestamp ASC;
    `;
    const { rows } = await pool.query(query, [conversationId]);

    // Mapeia os resultados do banco para as classes de mensagem do LangChain.
    const history = rows.map(row => {
      if (row.sender === 'user') {
        return new HumanMessage(row.message_text);
      } else {
        return new AIMessage(row.message_text);
      }
    });

    console.log(
      `[Repo] Histórico de ${history.length} mensagens recuperado para a conversa ${conversationId}`
    );
    return history;
  } catch (error) {
    console.error('Erro ao recuperar histórico no repositório:', error);
    throw new Error('Não foi possível recuperar o histórico da conversa.');
  }
};

/**
 * Busca todas as conversas de um usuário para exibir na barra lateral (sidebar).
 * Ordena pela conversa atualizada mais recentemente.
 * @param userId - O ID do usuário cujas conversas serão buscadas.
 * @returns Um array de objetos contendo o `id` e o `title` de cada conversa.
 * @throws Lança um erro se a consulta ao banco de dados falhar.
 */
export const getConversationsForUser = async (userId: string) => {
  try {
    const query = `
      SELECT id, title 
      FROM conversations 
      WHERE user_id = $1 
      ORDER BY updated_at DESC;
    `;
    const { rows } = await pool.query(query, [userId]);
    return rows;
  } catch (error) {
    console.error('Erro ao buscar conversas do usuário:', error);
    throw new Error('Não foi possível carregar as conversas.');
  }
};

/**
 * Busca todas as mensagens de uma conversa para serem exibidas no frontend.
 * Diferente do `getHistory`, esta função retorna todos os dados relevantes para a UI,
 * incluindo o `id` da mensagem e o `thought_log`.
 * @param conversationId - O ID da conversa a ser carregada.
 * @param userId - O ID do usuário logado, para verificação de permissão.
 * @returns Um array de objetos de mensagem, prontos para serem enviados ao frontend.
 * @throws Lança um erro se o usuário não for o dono da conversa ou se a consulta falhar.
 */
export const getMessagesByConversationId = async (conversationId: string, userId: string) => {
  const ownerId = await getConversationOwner(conversationId);
  if (ownerId !== userId) {
    throw new Error('Acesso negado.');
  }

  const query = `
    SELECT id, sender, message_text, thought_log
    FROM messages 
    WHERE conversation_id = $1 
    ORDER BY timestamp ASC;
  `;
  const { rows } = await pool.query(query, [conversationId]);

  return rows.map(row => ({
    id: row.id,
    sender: row.sender,
    text: row.message_text,
    thoughtLog: row.thought_log,
  }));
};

/**
 * Deleta permanentemente uma conversa e todas as suas mensagens associadas.
 * A exclusão em cascata (`ON DELETE CASCADE`) no banco de dados garante que as mensagens
 * sejam apagadas junto com a conversa.
 * @param conversationId - O ID da conversa a ser deletada.
 * @param userId - O ID do usuário logado, para verificação de permissão.
 * @returns Um objeto indicando sucesso.
 * @throws Lança um erro se o usuário não for o dono da conversa ou se a exclusão falhar.
 */
export const deleteConversation = async (conversationId: string, userId: string) => {
  const ownerId = await getConversationOwner(conversationId);
  if (ownerId !== userId) {
    throw new Error('Acesso negado.');
  }

  try {
    const query = `DELETE FROM conversations WHERE id = $1;`;
    await pool.query(query, [conversationId]);
    console.log(`[Repo] Conversa ${conversationId} deletada.`);
    return { success: true };
  } catch (error) {
    console.error(`Erro ao deletar conversa ${conversationId}:`, error);
    throw new Error('Não foi possível deletar a conversa.');
  }
};
