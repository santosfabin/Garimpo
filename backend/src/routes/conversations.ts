import express from "express";
const {
  listUserConversations,
  getConversationMessages,
} = require("../controller/conversationController");

const router = express.Router();

// Rota para listar todas as conversas do usuário logado
router.get("/", listUserConversations);

// Rota para buscar todas as mensagens de uma conversa específica
router.get("/:conversationId/messages", getConversationMessages);

module.exports = router;
