import pool from '../database/connection';
import { HumanMessage, AIMessage } from '@langchain/core/messages';

/**
 * Cria uma nova conversa no banco de dados para um usuário específico.
 * @param userId - O ID (UUID) do usuário que está iniciando a conversa.
 * @param title - Um título para a conversa (gerado pela IA ou pela primeira mensagem).
 * @returns O objeto da conversa criada, incluindo seu novo ID.
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
 * Adiciona uma nova mensagem a uma conversa existente.
 * @param conversationId - O ID da conversa onde a mensagem será adicionada.
 * @param sender - Quem enviou a mensagem ('user' ou 'ai').
 * @param text - O conteúdo da mensagem.
 */
export const addMessage = async (conversationId: string, sender: 'user' | 'ai', text: string) => {
  try {
    const query = `
      INSERT INTO messages (conversation_id, sender, message_text) 
      VALUES ($1, $2, $3);
    `;
    await pool.query(query, [conversationId, sender, text]);
    console.log(`[Repo] Mensagem do tipo '${sender}' adicionada à conversa ${conversationId}`);
  } catch (error) {
    console.error('Erro ao adicionar mensagem no repositório:', error);
    throw new Error('Não foi possível salvar a mensagem.');
  }
};

/**
 * Busca o ID do usuário dono de uma conversa específica.
 * Essencial para a camada de controle verificar a permissão de acesso.
 * @param conversationId - O ID da conversa a ser verificada.
 * @returns O ID do usuário (user_id) ou null se a conversa não for encontrada.
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
 * @param conversationId - O ID da conversa a ser recuperada.
 * @returns Um array de mensagens formatadas para o LangChain (HumanMessage ou AIMessage).
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
    // Isso é crucial para o LLM entender o fluxo da conversa (quem disse o quê).
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
