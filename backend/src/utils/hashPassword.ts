const bcrypt = require("bcrypt");

export async function hashPassword(password: string) {
  try {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);
    return hash;
  } catch (error) {
    console.error("Falha na geração do hash da senha - ", error);
    return false;
  }
}