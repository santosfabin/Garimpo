import express from 'express';

// Importa as funções do controller que vão de fato lidar com a lógica da requisição.
const { handleChatRequest, streamChatResponse } = require('../controller/chatController');

// Cria uma nova instância de um roteador do Express.
// Este roteador vai agrupar todas as rotas relacionadas ao chat.
const router = express.Router();

/**
 * Propósito: É usada pelo frontend para ENVIAR uma nova mensagem do usuário.
 * O frontend envia o texto da mensagem e, opcionalmente, o ID da conversa no corpo da requisição.
 * O backend processa isso, salva no banco e retorna um ID de conversa.
 */
router.post('/', handleChatRequest);

/**
 * Propósito: É usada pelo frontend para RECEBER a resposta da IA.
 * Após obter o `conversationId` da rota POST, o frontend se conecta a esta rota
 * para estabelecer uma conexão de streaming (Server-Sent Events) e receber os dados
 * da resposta da IA em tempo real.
 */
router.get('/stream/:conversationId', streamChatResponse);

// Exporta o roteador configurado para ser usado no arquivo principal de rotas (routes/index.ts).
module.exports = router;
