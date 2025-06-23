// backend/src/controller/conversationController.ts

import { Request, Response } from 'express';
import * as conversationService from '../services/conversationService';
import { getUserIdFromToken } from '../utils/getUserIdFromToken';

/**
 * Lida com a requisição para listar as conversas de um usuário.
 * Extrai o ID do usuário do token e chama o serviço para buscar os dados.
 */
export const listUserConversations = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromToken(req.cookies.session_id);
    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado.' });
    }

    // Delega a busca para a camada de serviço.
    const conversations = await conversationService.listConversations(userId);
    return res.status(200).json(conversations);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

/**
 * Lida com a requisição para buscar as mensagens de uma conversa específica.
 * Extrai IDs do token e dos parâmetros da URL, e chama o serviço para a busca.
 */
export const getConversationMessages = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromToken(req.cookies.session_id);
    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado.' });
    }

    const { conversationId } = req.params;
    // Delega a busca e validação de posse para o serviço.
    const messages = await conversationService.getMessages(conversationId, userId);
    return res.status(200).json(messages);
  } catch (error: any) {
    // Retorna um código de status específico para erro de permissão.
    const statusCode = error.message === 'Acesso negado.' ? 403 : 500;
    return res.status(statusCode).json({ error: error.message });
  }
};

/**
 * Lida com a requisição para deletar uma conversa.
 * Extrai IDs e chama o serviço para realizar a exclusão.
 */
export const removeConversation = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromToken(req.cookies.session_id);
    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado.' });
    }

    const { conversationId } = req.params;
    // Delega a exclusão e validação de posse para o serviço.
    await conversationService.deleteConversation(conversationId, userId);

    return res.status(200).json({ message: 'Conversa deletada com sucesso.' });
  } catch (error: any) {
    // Retorna um código de status específico para erro de permissão.
    const statusCode = error.message === 'Acesso negado.' ? 403 : 500;
    return res.status(statusCode).json({ error: error.message });
  }
};
