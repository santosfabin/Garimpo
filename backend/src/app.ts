import express, { Express } from 'express';
import routes from './routes';
import pool from './database/connection';
import config from './config';
import cookieParser from 'cookie-parser';
import path from 'path';

const app: Express = express();
const PORT: number = Number(config.PORT) || 3000;

app.use(cookieParser());
app.use(express.json());

app.use('/api', routes);

// Serve arquivos estáticos do React (build)
const staticPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(staticPath));

// Redireciona qualquer rota não API para index.html
app.get(`/{*splat}`, (_req, res) => {
  res.sendFile(path.join(staticPath, 'index.html'));
});

pool
  .connect()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Servidor rodando em http://localhost:${PORT}`);
    });
  })
  .catch((e: any) => {
    if (e instanceof Error) {
      console.error('Erro na conexão com o banco de dados:', e);
    } else {
      console.error('Erro na conexão com o banco de dados:', e);
    }
  });
