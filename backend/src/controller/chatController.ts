import { Request, Response } from 'express';
import * as chatService from '../services/chatService';
import * as conversationRepo from '../repository/conversationRepository';
import { getUserIdFromToken } from '../utils/getUserIdFromToken';

/**
 * Lida com a requisição POST para /api/chat.
 * Esta função é o ponto de entrada para qualquer mensagem enviada pelo usuário.
 * Suas responsabilidades são:
 * 1. Autenticar o usuário via token (cookie).
 * 2. Validar a mensagem recebida.
 * 3. Gerenciar a conversa: continua uma existente ou cria uma nova se necessário.
 * 4. Salvar a mensagem do usuário no banco de dados.
 * 5. Retornar o ID da conversa para o frontend, para que ele saiba qual stream escutar.
 *
 * @param req - O objeto de requisição do Express, contendo o corpo (message, conversationId) e os cookies.
 * @param res - O objeto de resposta do Express, usado para enviar o ID da conversa ou um erro.
 */
export const handleChatRequest = async (req: Request, res: Response) => {
  try {
    const token = req.cookies.session_id;
    if (!token) {
      return res.status(401).json({ error: 'Token de sessão não fornecido.' });
    }
    const userId = getUserIdFromToken(token);
    if (!userId) {
      return res.status(401).json({ error: 'Token de sessão inválido.' });
    }

    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'A mensagem não pode estar vazia.' });
    }

    let conversationId: string = req.body.conversationId;

    if (conversationId) {
      // Se um ID de conversa foi enviado, verifica se o usuário atual é o dono dela.
      const ownerId = await conversationRepo.getConversationOwner(conversationId);
      if (!ownerId || ownerId !== userId) {
        // Se não for o dono, encerra a requisição com status 403 (Proibido).
        return res.status(403).end();
      }
    } else {
      // Se nenhum ID foi enviado, é uma nova conversa.
      // a. Pede ao chatService para gerar um título baseado na primeira mensagem.
      const title = await chatService.generateTitle(message);
      // b. Pede ao repositório para criar a nova conversa no banco de dados.
      const newConversation = await conversationRepo.createConversation(userId, title);
      conversationId = newConversation.id;
    }

    // Adiciona a mensagem do usuário à conversa (seja ela nova ou existente).
    await conversationRepo.addMessage(conversationId, 'user', message);

    // Retorna o ID da conversa com status 200 (OK).
    // O frontend usará este ID para se conectar à rota de streaming.
    return res.status(200).json({ conversationId: conversationId });
  } catch (error: any) {
    console.error('Erro em handleChatRequest:', error);
    return res.status(500).json({ error: 'Erro interno ao processar a mensagem.' });
  }
};

/**
 * Lida com a requisição GET para /api/chat/stream/:conversationId.
 * Esta função estabelece uma conexão de Server-Sent Events (SSE) para enviar
 * a resposta da IA em tempo real para o frontend.
 *
 * @param req - O objeto de requisição do Express, contendo o ID da conversa nos parâmetros da URL.
 * @param res - O objeto de resposta do Express, que será mantido aberto para o streaming.
 */
export const streamChatResponse = async (req: Request, res: Response) => {
  const { conversationId } = req.params;

  try {
    // Garante que apenas o dono da conversa possa "escutar" o stream.
    const token = req.cookies.session_id;
    if (!token) {
      // Como a conexão já espera um 'text/event-stream', não podemos enviar um JSON de erro.
      // Apenas encerramos a conexão com um código de status.
      return res.status(404).end();
    }
    const userId = getUserIdFromToken(token);
    if (!userId) {
      return res.status(404).end();
    }

    const ownerId = await conversationRepo.getConversationOwner(conversationId);
    if (!ownerId || ownerId !== userId) {
      return res.status(404).end();
    }

    // Se a validação passar, o `chatService` assume o controle do objeto `res`
    // para começar a enviar os eventos do stream (status, chunks, logs, etc.).
    await chatService.streamResponse(conversationId, res);
  } catch (error) {
    console.error(`Erro ao iniciar o stream para a conversa ${conversationId}:`, error);
    // Se houver um erro antes de o stream começar, encerra a conexão.
    res.end();
  }
};
