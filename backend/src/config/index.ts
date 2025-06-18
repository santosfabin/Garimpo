import dotenv from 'dotenv';
dotenv.config();

import { IConfig } from '../interfaces/env';

function getEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

const config: IConfig = {
  NODE_ENV: getEnvVar('NODE_ENV') as 'development',
  HOSTNAME: getEnvVar('HOSTNAME'),
  PORT: Number(getEnvVar('PORT')),
  SECRET_KEY: getEnvVar('SECRET_KEY'),
  DB_HOST: getEnvVar('DB_HOST'),
  DB_USER: getEnvVar('DB_USER'),
  DB_PASSWORD: getEnvVar('DB_PASSWORD'),
  DB_NAME: getEnvVar('DB_NAME'),
  DB_PORT: Number(getEnvVar('DB_PORT')),
  OPENAI_API_KEY: getEnvVar('OPENAI_API_KEY'),
  TMDB_API_KEY: getEnvVar('TMDB_API_KEY'),
};

export default config;
