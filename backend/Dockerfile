# Imagem base
FROM node:20-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --verbose

COPY tsconfig.json ./

EXPOSE 7000

CMD ["npm", "run", "dev"]