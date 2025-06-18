import jwt, { JwtPayload } from 'jsonwebtoken';
import config from '../config';

export const getUserIdFromToken = (token: string): string | null => {
  try {
    const decoded = jwt.verify(token, config.SECRET_KEY) as JwtPayload;

    if (!decoded.user) {
      return null;
    }

    return decoded.user;
  } catch (error) {
    return null;
  }
};
