import { Request, Response } from 'express';
import { getUserIdFromToken } from '../utils/getUserIdFromToken';
const userService = require('../services/userService');

const createUser = async (req: Request, res: Response) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Dados insuficientes' });
    }

    const result = await userService.createUser(name, email, password);

    if (result.error) {
      return res.status(400).json({ error: result });
    }

    res.cookie('session_id', result.sessionToken, {
      httpOnly: true,
      maxAge: 864000000,
    });

    return res.status(200).json(result.user);
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
};

const updateUser = async (req: Request, res: Response) => {
  try {
    const token = req.cookies.session_id;
    if (!token) return res.status(401).json({ error: 'Token não fornecido' });

    const id = getUserIdFromToken(token);
    if (!id) return res.status(401).json({ error: 'Token inválido' });

    const { name, email, password } = req.body;

    if (!name && !email && !password) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    const updatedFields: any = {};
    if (name) {
      updatedFields.name = name;
    }
    if (email) {
      updatedFields.email = email;
    }
    if (password) {
      updatedFields.password = password;
    }

    const result = await userService.updateUser(id, updatedFields);
    if (result.error) {
      return res.status(400).json({ error: result });
    }

    return res.status(200).json(result.user);
  } catch (error: any) {
    console.error('Console.erro', error);

    return res.status(400).json({ error: 'Erro ao atualizar usuário.', message: error.message });
  }
};

const removeUser = async (req: Request, res: Response) => {
  try {
    const token = req.cookies.session_id;
    if (!token) return res.status(401).json({ error: 'Token não fornecido' });

    const id = getUserIdFromToken(token);
    if (!id) return res.status(401).json({ error: 'Token inválido' });

    const result = await userService.removeUser(id);
    if (result.error) {
      return res.status(400).json({ error: result });
    }

    res.cookie('session_id', '', { expires: new Date(0) });

    return res.status(200).json(result);
  } catch (error) {
    console.error('Console.erro', error);

    return res.status(400).json({ error: 'Erro ao remover usuário.' });
  }
};

const showOneUsers = async (req: Request, res: Response) => {
  try {
    const token = req.cookies.session_id;
    if (!token) return res.status(401).json({ error: 'Token não fornecido' });

    const id = getUserIdFromToken(token);
    if (!id) return res.status(401).json({ error: 'Token inválido' });

    const result = await userService.showOneUsers(id);
    if (result.error) {
      return res.status(400).json({ error: result });
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error('Console.erro', error);

    return res.status(400).json({ error: 'Erro ao remover usuário.' });
  }
};

module.exports = { createUser, updateUser, showOneUsers, removeUser };
