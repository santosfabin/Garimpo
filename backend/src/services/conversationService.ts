import * as conversationRepo from '../repository/conversationRepository';

/**
 * Busca todas as conversas de um usuário.
 */
export const listConversations = async (userId: string) => {
  // Atualmente, apenas repassa a chamada.
  // Futuramente, poderia adicionar paginação ou outra lógica aqui.
  const conversations = await conversationRepo.getConversationsForUser(userId);
  return conversations;
};

/**
 * Busca todas as mensagens de uma conversa, validando a posse.
 */
export const getMessages = async (conversationId: string, userId: string) => {
  // A validação de posse já ocorre no repositório, mas a camada de serviço
  // é um bom lugar para orquestrar isso.
  const messages = await conversationRepo.getMessagesByConversationId(conversationId, userId);
  return messages;
};

/**
 * Deleta uma conversa, validando a posse.
 */
export const deleteConversation = async (conversationId: string, userId: string) => {
  // Repassa a chamada para o repositório, que contém a lógica de exclusão.
  await conversationRepo.deleteConversation(conversationId, userId);
  return { success: true };
};
