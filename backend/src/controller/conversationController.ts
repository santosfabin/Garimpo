// ARQUIVO: /backend/src/controller/conversationController.ts

import { Request, Response } from 'express';
// Remova a importação do repositório
// import * as conversationRepo from '../repository/conversationRepository';
import * as conversationService from '../services/conversationService'; // <-- Adicione a importação do serviço
import { getUserIdFromToken } from '../utils/getUserIdFromToken';

export const listUserConversations = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromToken(req.cookies.session_id);
    if (!userId) return res.status(401).json({ error: 'Usuário não autenticado.' });

    // Chama o serviço em vez do repositório
    const conversations = await conversationService.listConversations(userId);
    return res.status(200).json(conversations);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const getConversationMessages = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromToken(req.cookies.session_id);
    if (!userId) return res.status(401).json({ error: 'Usuário não autenticado.' });

    const { conversationId } = req.params;
    // Chama o serviço em vez do repositório
    const messages = await conversationService.getMessages(conversationId, userId);
    return res.status(200).json(messages);
  } catch (error: any) {
    // O serviço/repositório já lança erro de "Acesso negado" que causa um 403
    const statusCode = error.message === 'Acesso negado.' ? 403 : 500;
    return res.status(statusCode).json({ error: error.message });
  }
};

export const removeConversation = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromToken(req.cookies.session_id);
    if (!userId) return res.status(401).json({ error: 'Usuário não autenticado.' });

    const { conversationId } = req.params;
    // Chama o serviço em vez do repositório
    await conversationService.deleteConversation(conversationId, userId);

    return res.status(200).json({ message: 'Conversa deletada com sucesso.' });
  } catch (error: any) {
    // Se o erro for de "Acesso negado", retorna 403, senão 500.
    const statusCode = error.message === 'Acesso negado.' ? 403 : 500;
    return res.status(statusCode).json({ error: error.message });
  }
};
