import pool from '../database/connection';

const createUserSql = async (name: string, email: string, password: string) => {
  try {
    const result = await pool.query(
      'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING *',
      [name, email, password]
    );
    return result.rows;
  } catch (e: any) {
    console.error('Console.erro', e);
    if (e.code === '23505' && e.constraint === 'users_email_key') {
      throw new Error('Erro ao criar usuário');
    }

    throw new Error(e.message);
  }
};

const updateUserSql = async (id: number, updatedFields: any) => {
  try {
    const userCheckQuery = 'SELECT * FROM users WHERE id = $1';
    const userCheckResult = await pool.query(userCheckQuery, [id]);

    if (userCheckResult.rowCount === 0) {
      console.error('Usuário não encontrado.');
      throw new Error(`Usuário não encontrado.`);
    }

    if (updatedFields.email) {
      const emailCheckQuery = 'SELECT * FROM users WHERE email = $1 AND id != $2';
      const emailCheckResult = await pool.query(emailCheckQuery, [updatedFields.email, id]);

      if (emailCheckResult.rowCount! > 0) {
        throw new Error('Não foi possível atualizar o usuário.');
      }
    }

    let setClause = '';
    const values: any[] = [];
    let valueIndex = 1;

    if (updatedFields.name) {
      setClause += `name = $${valueIndex}, `;
      values.push(updatedFields.name);
      valueIndex++;
    }

    if (updatedFields.email) {
      setClause += `email = $${valueIndex}, `;
      values.push(updatedFields.email);
      valueIndex++;
    }

    if (updatedFields.password) {
      setClause += `password = $${valueIndex}, `;
      values.push(updatedFields.password);
      valueIndex++;
    }

    if (!setClause) {
      console.error('Nenhum campo para atualizar.');
      throw new Error(`Nenhum campo para atualizar.`);
    }

    setClause = setClause.slice(0, -2);

    values.push(id);
    const query = `UPDATE users SET ${setClause} WHERE id = $${valueIndex} RETURNING *`;

    const result = await pool.query(query, values);

    if (result.rowCount === 0) {
      console.error('Erro ao atualizar usuário.');
      throw new Error(`Erro ao atualizar usuário.`);
    }

    return result.rows;
  } catch (e: any) {
    throw new Error(e.message);
  }
};

const removeUserSql = async (id: number) => {
  try {
    // A query já retornava os dados, o que é perfeito!
    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id, name, email', [
      id,
    ]);

    if (result.rowCount === 0) {
      throw new Error('Usuário não encontrado para exclusão.');
    }
    return result.rows[0]; // Retorna o objeto do usuário deletado
  } catch (e: any) {
    console.error('Console.erro', e);
    throw new Error(e.message);
  }
};

const showOneUsersSql = async (id: number) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return result.rows;
  } catch (e) {
    console.error(e);
    return null;
  }
};

module.exports = { createUserSql, updateUserSql, showOneUsersSql, removeUserSql };
