import { Request, Response } from 'express';
import * as chatService from '../services/chatService';
import * as conversationRepo from '../repository/conversationRepository';
import { getUserIdFromToken } from '../utils/getUserIdFromToken';

/**
 * Lida com a requisição POST para enviar uma mensagem.
 * Valida o usuário, gerencia a conversa (cria ou continua),
 * salva a mensagem do usuário e retorna o ID da conversa.
 */
export const handleChatRequest = async (req: Request, res: Response) => {
  try {
    const token = req.cookies.session_id;
    if (!token) return res.status(401).json({ error: 'Token de sessão não fornecido.' });

    const userId = getUserIdFromToken(token);
    if (!userId) return res.status(401).json({ error: 'Token de sessão inválido.' });

    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'A mensagem não pode estar vazia.' });

    let conversationId: string = req.body.conversationId;

    if (conversationId) {
      const ownerId = await conversationRepo.getConversationOwner(conversationId);
      if (!ownerId || ownerId !== userId) {
        return res
          .status(403)
          .json({ error: 'Você não tem permissão para acessar esta conversa.' });
      }
    } else {
      const title = await chatService.generateTitle(message);
      const newConversation = await conversationRepo.createConversation(userId, title);
      conversationId = newConversation.id;
    }

    await conversationRepo.addMessage(conversationId, 'user', message);

    // Retorna o ID para o frontend saber qual URL de stream escutar.
    return res.status(200).json({ conversationId: conversationId });
  } catch (error: any) {
    console.error('Erro em handleChatRequest:', error);
    return res.status(500).json({ error: 'Erro ao processar a mensagem.' });
  }
};

/**
 * Lida com a requisição GET para fazer o streaming da resposta da IA.
 * Passa a responsabilidade de gerenciar o stream para o chatService.
 */
export const streamChatResponse = async (req: Request, res: Response) => {
  const { conversationId } = req.params;

  // Validação de segurança para a rota de stream
  try {
    const token = req.cookies.session_id;
    if (!token) {
      // Não podemos enviar JSON aqui pois o content-type já será text/event-stream
      return res.status(401).end();
    }
    const userId = getUserIdFromToken(token);
    if (!userId) {
      return res.status(401).end();
    }
    const ownerId = await conversationRepo.getConversationOwner(conversationId);
    if (!ownerId || ownerId !== userId) {
      return res.status(403).end();
    }

    // Se a validação passar, o serviço assume o controle do objeto 'res' para fazer o stream.
    await chatService.streamResponse(conversationId, res);
  } catch (error) {
    console.error(`Erro ao iniciar o stream para a conversa ${conversationId}:`, error);
    res.end();
  }
};
