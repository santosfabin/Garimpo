import * as conversationRepo from '../repository/conversationRepository';

/**
 * Orquestra a busca de todas as conversas de um usuário.
 *
 * @param userId - O ID do usuário cujas conversas serão listadas.
 * @returns Um array com as conversas do usuário, ordenadas pela mais recente.
 */
export const listConversations = async (userId: string) => {
  // Chama a função correspondente no repositório para executar a query no banco.
  const conversations = await conversationRepo.getConversationsForUser(userId);
  return conversations;
};

/**
 * Orquestra a busca de todas as mensagens de uma conversa específica.
 *
 * @param conversationId - O ID da conversa cujas mensagens serão buscadas.
 * @param userId - O ID do usuário que está fazendo a requisição, para validar a permissão.
 * @returns Um array com as mensagens da conversa.
 */
export const getMessages = async (conversationId: string, userId: string) => {
  // Delega a busca e a validação de posse para a função do repositório.
  const messages = await conversationRepo.getMessagesByConversationId(conversationId, userId);
  return messages;
};

/**
 * Orquestra a exclusão de uma conversa.
 *
 * @param conversationId - O ID da conversa a ser deletada.
 * @param userId - O ID do usuário que está fazendo a requisição, para validar a permissão.
 * @returns Um objeto indicando que a operação foi bem-sucedida.
 */
export const deleteConversation = async (conversationId: string, userId: string) => {
  // Chama a função do repositório que lida com a validação e a exclusão no banco.
  await conversationRepo.deleteConversation(conversationId, userId);
  // Retorna uma confirmação para o controller.
  return { success: true };
};
