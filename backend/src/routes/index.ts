import { Router } from 'express';

const { verifyActiveSession } = require('../middleware');
const router: Router = Router();

const users = require('./users');
const login = require('./login');
const logout = require('./logout');
const chat = require('./chat');
const conversations = require('./conversations');

router.use('/users', users);
router.use('/login', login);

// Aplica o middleware de sessão ativa para todas as rotas abaixo
router.use(verifyActiveSession);

router.use('/logout', logout);

// Recebimento de mensagem e criação da conversa
router.use('/chat', chat);

// Gerencimanto das conversas
router.use('/conversations', conversations);

export default router;
