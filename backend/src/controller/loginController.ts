import { Request, Response } from 'express';
const loginServices = require('../services/loginServices');

const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Preenchimento obrigatório dos campos de e-mail e senha',
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Formato de e-mail inválido' });
    }

    const result = await loginServices.authenticateUser(email, password);

    res.cookie('session_id', result.sessionToken, {
      httpOnly: true,
      maxAge: 864000000,
    });

    // res.status(200).json({ message: `OK` });
    res.status(200).json({ id: result.user });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { login };
