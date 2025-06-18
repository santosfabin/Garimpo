import { ChatOpenAI } from '@langchain/openai';
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import * as tmdbService from './tmdbService';
import config from '../config';
import * as conversationRepo from '../repository/conversationRepository';
import { Response } from 'express';

// --- CONFIGURAÇÃO DO MODELO E FERRAMENTAS ---

const llm = new ChatOpenAI({
  modelName: 'gpt-4o',
  temperature: 0,
  openAIApiKey: config.OPENAI_API_KEY,
});

const searchToolSchema = {
  name: 'search_movies_by_keyword',
  description: 'Busca por filmes baseado em um gênero, ator, diretor ou palavra-chave.',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string', description: 'O termo de busca.' } },
    required: ['query'],
  },
};
const detailsToolSchema = {
  name: 'get_movie_details',
  description: 'Busca informações detalhadas sobre um filme específico pelo título.',
  parameters: {
    type: 'object',
    properties: { title: { type: 'string', description: 'O título do filme.' } },
    required: ['title'],
  },
};
const discoverToolSchema = {
  name: 'discover_movies',
  description: 'Descobre filmes com base em filtros como gênero, ano e nota mínima.',
  parameters: {
    type: 'object',
    properties: {
      genreName: { type: 'string' },
      minRating: { type: 'number' },
      year: { type: 'number' },
    },
    required: [],
  },
};

const llmWithTools = llm.bind({
  tools: [
    { type: 'function', function: searchToolSchema },
    { type: 'function', function: detailsToolSchema },
    { type: 'function', function: discoverToolSchema },
  ],
});

// --- LÓGICA DO AGENTE MANUAL ---

const runManualAgent = async (
  chatHistory: (HumanMessage | AIMessage | SystemMessage | ToolMessage)[]
): Promise<string> => {
  const firstResponse = await llmWithTools.invoke(chatHistory);
  const toolCalls = firstResponse.additional_kwargs.tool_calls;

  if (toolCalls && toolCalls.length > 0) {
    console.log(`[Manual Agent] IA solicitou o uso de ${toolCalls.length} ferramenta(s).`);

    const historyForSecondCall = [...chatHistory, firstResponse];

    const toolOutputs = await Promise.all(
      toolCalls.map(async (toolCall: any) => {
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments);
        let output: any;

        console.log(`[Manual Agent] Executando ferramenta: ${toolName} com args:`, toolArgs);
        if (toolName === 'search_movies_by_keyword') {
          output = await tmdbService.searchMoviesByKeyword(toolArgs.query);
        } else if (toolName === 'get_movie_details') {
          output = await tmdbService.getMovieDetails(toolArgs.title);
        } else if (toolName === 'discover_movies') {
          output = await tmdbService.discoverMovies(toolArgs);
        } else {
          output = `Ferramenta desconhecida: ${toolName}`;
        }
        return new ToolMessage({ content: JSON.stringify(output), tool_call_id: toolCall.id });
      })
    );

    historyForSecondCall.push(...toolOutputs);

    const finalResponse = await llmWithTools.invoke(historyForSecondCall);
    return finalResponse.content.toString();
  } else {
    return firstResponse.content.toString();
  }
};

// --- FUNÇÕES EXPORTADAS ---

export const streamResponse = async (conversationId: string, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (data: any) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const chatHistory = await conversationRepo.getHistory(conversationId);
    const fullHistory = [
      new SystemMessage(
        "Você é 'Garimpo', um assistente de cinema divertido e especialista. Seu único propósito é ajudar usuários a encontrar os melhores filmes. Responda sempre em português do Brasil. Se o usuário perguntar sobre qualquer outro assunto que não seja filmes, séries ou cinema, recuse educadamente a pergunta e o lembre de seu propósito."
      ),
      ...chatHistory,
    ];

    const finalAnswer = await runManualAgent(fullHistory);

    if (finalAnswer) {
      await conversationRepo.addMessage(conversationId, 'ai', finalAnswer);
    }

    const chunks = finalAnswer.split(' ');
    for (const chunk of chunks) {
      sendEvent({ type: 'chunk', content: chunk + ' ' });
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  } catch (error) {
    console.error('Erro durante o processamento do stream:', error);
    sendEvent({ type: 'error', message: 'Ocorreu um erro ao processar sua solicitação.' });
  } finally {
    sendEvent({ type: 'close' });
    res.end();
  }
};

export const generateTitle = async (firstMessage: string): Promise<string> => {
  console.log('[chatService] Gerando título para a nova conversa...');
  const titleLlm = new ChatOpenAI({
    modelName: 'gpt-4o',
    temperature: 0.3,
    openAIApiKey: config.OPENAI_API_KEY,
  });
  const prompt = `Você é um assistente que cria títulos curtos e descritivos (máximo 5 palavras) para conversas, baseado na primeira mensagem do usuário. Responda APENAS com o título, sem nenhuma outra palavra ou pontuação. Mensagem do usuário: "${firstMessage}"`;
  const response = await titleLlm.invoke(prompt);
  const title = response.content.toString().trim().replace(/"/g, '');
  console.log(`[chatService] Título gerado: "${title}"`);
  return title;
};
