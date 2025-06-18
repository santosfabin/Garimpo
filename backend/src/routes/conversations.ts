import express from 'express';
const {
  listUserConversations,
  getConversationMessages,
  removeConversation,
} = require('../controller/conversationController');

const router = express.Router();

// Rota para listar todas as conversas do usuário logado
router.get('/', listUserConversations);

// Rota para buscar todas as mensagens de uma conversa específica
router.get('/:conversationId/messages', getConversationMessages);
router.delete('/:conversationId', removeConversation);

module.exports = router;
