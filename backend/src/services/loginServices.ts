const loginRepository = require('../repository/loginRepository');
const { comparePassword } = require('../utils/comparePassword');
import { generateToken } from '../utils/generateToken';

const authenticateUser = async (email: string, password: string) => {
  try {
    const userData = await loginRepository.getUserData(email);

    if (!userData) {
      throw new Error('Credenciais inválidas');
    }

    const isPasswordValid = await comparePassword(password, userData.password);

    if (!isPasswordValid) {
      throw new Error('Credenciais inválidas');
    }

    const user = userData.id;

    const sessionToken = generateToken(userData.id);

    return { user, sessionToken };
  } catch (error) {
    throw error;
  }
};

module.exports = {
  authenticateUser,
};
