import express, { Request } from 'express';
import { verifyActiveSession } from '../middleware';
import { IUser } from '../interfaces/user';

const router = express.Router();

interface AuthRequest extends Request {
  user?: IUser;
}

const loginController = require('../controller/loginController');

router.post('/', loginController.login);

router.get('/checkLogin', verifyActiveSession, (req, res) => {
  res.json({ loggedIn: true, user: (req as AuthRequest).user });
});

module.exports = router;
