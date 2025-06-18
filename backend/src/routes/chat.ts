import express from 'express';

// Nomes das funções foram atualizados para clareza
const { handleChatRequest, streamChatResponse } = require('../controller/chatController');

const router = express.Router();

// Rota para ENVIAR uma mensagem e iniciar/continuar a conversa
router.post('/', handleChatRequest);

// Rota para RECEBER a resposta da IA via streaming
router.get('/stream/:conversationId', streamChatResponse);

module.exports = router;
