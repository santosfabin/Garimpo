import jwt from 'jsonwebtoken';
import config from '../config';

export const generateToken = (userId: number): string => {
  return jwt.sign({ user: userId }, config.SECRET_KEY, { expiresIn: '10d' });
};
