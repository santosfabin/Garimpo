CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE sender_type AS ENUM ('user', 'ai');

CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    title VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_user
        FOREIGN KEY(user_id) 
        REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE TABLE messages (
    id BIGSERIAL PRIMARY KEY,
    conversation_id UUID NOT NULL,
    sender sender_type NOT NULL,
    message_text TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_conversation
        FOREIGN KEY(conversation_id) 
        REFERENCES conversations(id)
        ON DELETE CASCADE
);

-- Apaga a função de gatilho se ela existir de uma tentativa anterior, para evitar erros.
DROP FUNCTION IF EXISTS update_timestamp_column();

-- Cria a tabela que armazenará as preferências de cada usuário.
CREATE TABLE user_preferences (
    -- Chave primária. É o mesmo ID do usuário na tabela 'users'.
    user_id UUID PRIMARY KEY,
    
    -- Armazena uma lista de gêneros que o usuário gosta. Ex: {'Ação', 'Comédia'}
    favorite_genres TEXT[] DEFAULT ARRAY[]::TEXT[],
    
    -- Armazena uma lista de atores/atrizes que o usuário gosta.
    favorite_actors TEXT[] DEFAULT ARRAY[]::TEXT[],
    
    -- Armazena uma lista de diretores que o usuário gosta.
    favorite_directors TEXT[] DEFAULT ARRAY[]::TEXT[],

    -- (CORRIGIDO) Armazena uma lista de filmes que o usuário gosta. Ex: {'Forrest Gump'}
    favorite_movies TEXT[] DEFAULT ARRAY[]::TEXT[],
    
    -- (CORRIGIDO) Armazena uma lista de décadas preferidas. Ex: {'1990s', '2020s'}
    favorite_decades TEXT[] DEFAULT ARRAY[]::TEXT[],
    
    -- Armazena uma lista de gêneros que o usuário NÃO gosta.
    disliked_genres TEXT[] DEFAULT ARRAY[]::TEXT[],
    
    -- Armazena uma lista de atores/atrizes que o usuário NÃO gosta.
    disliked_actors TEXT[] DEFAULT ARRAY[]::TEXT[],
    
    -- Guarda uma lista de "vibes" ou humores. Ex: {'filme para relaxar', 'filme para pensar'}
    movie_moods TEXT[] DEFAULT ARRAY[]::TEXT[],
    
    -- (CORRIGIDO) Um campo para anotações que não se encaixam nos outros campos.
    -- Ex: {'gosto de filmes com reviravoltas', 'prefiro finais felizes'}
    other_notes TEXT[] DEFAULT ARRAY[]::TEXT[],
    
    -- Guarda a data e hora da última vez que as preferências foram alteradas.
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Define que 'user_id' é uma chave estrangeira que aponta para a tabela 'users'.
    CONSTRAINT fk_user
        FOREIGN KEY(user_id) 
        REFERENCES users(id)
        ON DELETE CASCADE
);
-- Cria a função que será usada pelo gatilho para atualizar o timestamp.
CREATE OR REPLACE FUNCTION update_timestamp_column()
RETURNS TRIGGER AS $$
BEGIN
   -- Define que a coluna 'updated_at' da linha que está sendo atualizada (NEW)
   -- receberá o valor da data e hora atuais (NOW()).
   NEW.updated_at = NOW(); 
   RETURN NEW;
END;
$$ language 'plpgsql';

-- Cria o gatilho que automatiza a atualização do campo 'updated_at'.
CREATE TRIGGER update_user_preferences_updated_at
-- O gatilho é disparado ANTES de um comando UPDATE na tabela user_preferences.
BEFORE UPDATE ON user_preferences
-- Ele roda para cada linha que for afetada pela atualização.
FOR EACH ROW
-- A ação que ele executa é chamar a função que criamos acima.
EXECUTE FUNCTION update_timestamp_column();