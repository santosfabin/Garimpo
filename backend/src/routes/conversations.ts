import express from 'express';

const {
  listUserConversations,
  getConversationMessages,
  removeConversation,
} = require('../controller/conversationController');

// Cria uma nova instância de roteador do Express para agrupar rotas de conversas.
const router = express.Router();

/**
 * Usada para carregar a lista de conversas na barra lateral do frontend.
 */
router.get('/', listUserConversations);

/**
 * Usada para carregar o histórico de uma conversa específica quando o usuário clica nela.
 */
router.get('/:conversationId/messages', getConversationMessages);

/**
 * Usada para apagar uma conversa inteira.
 */
router.delete('/:conversationId', removeConversation);

module.exports = router;
