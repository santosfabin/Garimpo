const express = require('express');
const router = express.Router();

const userController = require('../controller/userController');
import { verifyActiveSession } from '../middleware';

// a) Cadastro - POST /users/ (Público)
router.post('/', userController.createUser);

// f) Lista todos os usuários - GET /users/ (Autenticado)
router.get('/', verifyActiveSession, userController.showOneUsers);

// d) Atualiza o próprio usuário - PATCH /users (Autenticado)
// A rota agora é '/'. O ID virá do token, não da URL.
router.patch('/', verifyActiveSession, userController.updateUser);

// e) Remove o próprio usuário - DELETE /users (Autenticado)
// A rota agora é '/'. O ID virá do token, não da URL.
router.delete('/', verifyActiveSession, userController.removeUser);

module.exports = router;