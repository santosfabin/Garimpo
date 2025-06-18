import { ChatOpenAI } from '@langchain/openai';
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import * as tmdbService from './tmdbService';
import config from '../config';
import * as conversationRepo from '../repository/conversationRepository';
import { Response } from 'express'; // Importamos o tipo Response do Express

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
  chatHistory: (HumanMessage | AIMessage | SystemMessage | ToolMessage)[],
  res: Response
) => {
  const sendEvent = (data: any) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  // PRIMEIRA CHAMADA: IA decide o que fazer
  const firstResponse = await llmWithTools.invoke(chatHistory);
  const toolCalls = firstResponse.additional_kwargs.tool_calls;

  // SE A IA PEDIU UMA FERRAMENTA...
  if (toolCalls && toolCalls.length > 0) {
    console.log('[Manual Agent] IA solicitou o uso de ferramentas.');

    // Mostra o status para o frontend
    const toolName = toolCalls[0].function.name;
    sendEvent({ type: 'status', message: `Garimpando com a ferramenta: ${toolName}...` });

    // Lógica para executar a ferramenta
    const toolCall = toolCalls[0];
    const toolArgs = JSON.parse(toolCall.function.arguments);
    let toolOutput: any;

    if (toolName === 'search_movies_by_keyword') {
      toolOutput = await tmdbService.searchMoviesByKeyword(toolArgs.query);
    } else if (toolName === 'get_movie_details') {
      toolOutput = await tmdbService.getMovieDetails(toolArgs.title);
    } else if (toolName === 'discover_movies') {
      toolOutput = await tmdbService.discoverMovies(toolArgs);
    } else {
      toolOutput = `Ferramenta desconhecida: ${toolName}`;
    }

    const finalHistory = [
      ...chatHistory,
      firstResponse,
      new ToolMessage({
        content: JSON.stringify(toolOutput),
        tool_call_id: toolCall.id,
      }),
    ];

    // SEGUNDA CHAMADA: AGORA USANDO .stream() PARA OBTER A RESPOSTA FINAL
    console.log(
      '[Manual Agent] Enviando resultado da ferramenta e fazendo stream da resposta final...'
    );
    const finalResponseStream = await llmWithTools.stream(finalHistory);

    let fullResponse = '';
    // Iteramos sobre cada pedaço de texto que o LLM envia
    for await (const chunk of finalResponseStream) {
      const content = chunk.content.toString();
      if (content) {
        fullResponse += content;
        sendEvent({ type: 'chunk', content: content });
      }
    }
    return fullResponse; // Retorna a resposta completa para ser salva no DB
  } else {
    // SE A IA RESPONDEU DIRETAMENTE, fazemos o stream da resposta dela
    const content = firstResponse.content.toString();
    if (content) {
      sendEvent({ type: 'chunk', content });
    }
    return content;
  }
};

// --- FUNÇÕES EXPORTADAS ---

/**
 * Função principal que gerencia o streaming da resposta para o cliente.
 * @param conversationId O ID da conversa a ser processada.
 * @param res O objeto de resposta do Express, para que possamos escrever o stream nele.
 */
export const streamResponse = async (conversationId: string, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const chatHistory = await conversationRepo.getHistory(conversationId);
    const fullHistory = [
      new SystemMessage("Você é 'Garimpo'..."), // etc.
      ...chatHistory,
    ];

    // A função runManualAgent agora gerencia o stream e retorna a resposta completa
    const finalAnswer = await runManualAgent(fullHistory, res);

    // Salvamos a resposta completa no banco de dados APÓS o stream ter terminado
    if (typeof finalAnswer === 'string' && finalAnswer.length > 0) {
      await conversationRepo.addMessage(conversationId, 'ai', finalAnswer);
      console.log(`[Service] Resposta final salva na conversa ${conversationId}`);
    }
  } catch (error) {
    console.error('Erro durante o processamento do stream:', error);
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'Ocorreu um erro.' })}\n\n`);
  } finally {
    // Envia um evento final para o cliente e fecha a conexão.
    res.write(`data: ${JSON.stringify({ type: 'close' })}\n\n`);
    res.end();
  }
};

/**
 * Usa o LLM para gerar um título conciso para uma nova conversa.
 */
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
