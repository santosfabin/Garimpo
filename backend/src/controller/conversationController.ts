import { Request, Response } from 'express';
import * as conversationRepo from '../repository/conversationRepository';
import { getUserIdFromToken } from '../utils/getUserIdFromToken';

export const listUserConversations = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromToken(req.cookies.session_id);
    if (!userId) return res.status(401).json({ error: 'Usuário não autenticado.' });

    const conversations = await conversationRepo.getConversationsForUser(userId);
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
    const messages = await conversationRepo.getMessagesByConversationId(conversationId, userId);
    return res.status(200).json(messages);
  } catch (error: any) {
    return res.status(403).json({ error: error.message });
  }
};
