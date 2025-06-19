import { ChatOpenAI } from '@langchain/openai';
import {
  AIMessage,
  AIMessageChunk,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';
import config from '../config';
import * as conversationRepo from '../repository/conversationRepository';
import { Response } from 'express';
import { toolSchemas, executeTool, UnknownToolError } from './tools';
import { getUserIdFromToken } from '../utils/getUserIdFromToken';
import * as preferenceRepo from '../repository/preferenceRepository';

// --- CONFIGURAÇÃO DOS MODELOS E FERRAMENTAS ---
const llm = new ChatOpenAI({
  modelName: 'gpt-4o',
  temperature: 0,
  openAIApiKey: config.OPENAI_API_KEY,
});

const llmWithTools = llm.bind({
  tools: toolSchemas,
});

// REINTRODUZIDO: A IA Narradora de Status
const statusNarratorLlm = new ChatOpenAI({
  modelName: 'gpt-4o',
  temperature: 0.5,
  openAIApiKey: config.OPENAI_API_KEY,
});

/**
 * REINTRODUZIDO: Gera uma mensagem de status criativa e temática usando a IA.
 */
const generateStatusMessage = async (
  technicalMessage: string,
  toolName?: string,
  toolArgs?: any
): Promise<string> => {
  const safeArgs = { ...toolArgs };
  if (safeArgs.userId) {
    delete safeArgs.userId;
  }
  const argsJson = Object.keys(safeArgs).length > 0 ? JSON.stringify(safeArgs) : 'N/A';

  const finalPrompt = `Você é "Garimpo", um narrador de status para um chatbot de filmes. Sua única missão é criar uma frase curta (1 a 7 palavras) para o usuário ler enquanto aguarda.
Siga estas regras RÍGIDAS para criar a frase:
1.  TEMA OBRIGATÓRIO: A frase DEVE usar uma metáfora relacionada a garimpo, mineração, escavação ou geologia.
2.  FOCO NA AÇÃO: Sua frase deve refletir a ação que estou te passando:
    *   Ação Técnica Atual: "${technicalMessage}"
    *   Ferramenta Usada: "${toolName || 'Nenhuma'}"
    *   Argumentos: ${argsJson}
3.  TRADUZA A FERRAMENTA: Se uma ferramenta for usada, TRADUZA o nome técnico dela para uma ação de garimpo (ex: 'get_movie_details' vira 'Analisando a gema...', 'search_movies' vira 'Garimpando filmes...').
4.  SEJA CURTO E DIRETO: Sua resposta deve ser APENAS a frase final, sem explicações, saudações ou emojis.
Agora, gere a frase.`;

  try {
    const response = await statusNarratorLlm.invoke(finalPrompt);
    return response.content.toString().trim().replace(/"/g, '');
  } catch (e) {
    console.error('Erro ao gerar mensagem de status com a IA, usando fallback.', e);
    return 'Garimpando...';
  }
};

// --- LÓGICA DO AGENTE ROBUSTO (AGORA COM NARRADOR) ---

const runRobustAgent = async function* (
  initialHistory: (HumanMessage | AIMessage | SystemMessage | ToolMessage)[],
  userId: string
): AsyncGenerator<any> {
  const MAX_TURNS = 3;
  let currentTurn = 0;
  let history = [...initialHistory];

  while (currentTurn < MAX_TURNS) {
    currentTurn++;
    console.log(`[Agente Robusto] Iniciando turno de pensamento #${currentTurn}`);

    // AJUSTADO: Usa a IA Narradora em vez de texto fixo
    if (currentTurn === 1) {
      yield { type: 'status', message: await generateStatusMessage('Analisando sua pergunta.') };
    }

    const response: AIMessage = await llmWithTools.invoke(history);
    const toolCalls = response.additional_kwargs.tool_calls;

    if (response.content && typeof response.content === 'string' && response.content.length > 0) {
      console.log('[Agente Robusto] IA respondeu diretamente. Encerrando.');
      const finalStream = await llm.stream(history);
      for await (const chunk of finalStream) {
        yield { type: 'chunk', content: chunk.content };
      }
      return;
    }

    if (toolCalls && toolCalls.length > 0) {
      console.log(`[Agente Robusto] IA solicitou ${toolCalls.length} ferramenta(s).`);
      history.push(response);

      try {
        for (const toolCall of toolCalls) {
          const toolName = toolCall.function.name;
          const toolArgs = JSON.parse(toolCall.function.arguments);

          // AJUSTADO: Usa a IA Narradora para o status da ferramenta
          yield {
            type: 'status',
            message: await generateStatusMessage('Usando uma ferramenta.', toolName, toolArgs),
          };

          const output = await executeTool(toolName, { toolArgs, userId });
          const content =
            typeof output === 'string' || output === null ? String(output) : JSON.stringify(output);
          history.push(new ToolMessage({ content, tool_call_id: toolCall.id }));
        }
      } catch (error) {
        console.error('[Agente Robusto] Erro ao executar ferramenta:', error);
        if (error instanceof UnknownToolError) {
          yield {
            type: 'chunk',
            content: 'Ops! Tentei usar uma picareta que não tenho. Pode reformular sua pergunta?',
          };
        } else {
          yield { type: 'chunk', content: 'Desculpe, uma ferramenta quebrou. Tente novamente.' };
        }
        return;
      }
    } else {
      console.log('[Agente Robusto] IA parou sem resposta ou ferramenta. Acionando Plano B.');
      break;
    }
  }

  // --- PLANO B ---
  console.log('[Agente Robusto] Limite de tentativas atingido. Forçando resposta final.');
  yield {
    type: 'status',
    message: await generateStatusMessage(
      'Não encontrei de primeira, pensando em como responder...'
    ),
  };

  const finalPrompt = new SystemMessage(
    'Você não conseguiu encontrar uma resposta usando suas ferramentas. Analise o histórico da conversa e explique ao usuário de forma amigável e concisa que você não pôde completar o pedido. Se possível, sugira uma alternativa.'
  );

  const finalResponseStream = await llm.stream([...history, finalPrompt]);
  for await (const chunk of finalResponseStream) {
    yield { type: 'chunk', content: chunk.content };
  }
};

// --- FUNÇÕES EXPORTADAS ---

export const streamResponse = async (conversationId: string, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream'); // conexão que ficará aberta para eu enviar eventos (dados) continuamente
  res.setHeader('Cache-Control', 'no-cache'); // Impede que o navegador ou proxies guardem a resposta em cache (não ter duplicidade de informação)
  res.setHeader('Connection', 'keep-alive'); // Pede para a conexão TCP/IP entre o servidor e o cliente permanecer aberta
  res.flushHeaders(); // Envia esses cabeçalhos (headers) para o cliente imediatamente

  const sendEvent = (data: any) => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  };

  let finalAnswer = '';

  try {
    const token = (res.req as any).cookies.session_id;
    const userId = getUserIdFromToken(token);
    if (!userId) throw new Error('Usuário não autenticado para o stream.');

    // --- BUSCA DE DADOS ANTES DA IA ---
    // Busca o histórico da conversa e as preferências do usuário em paralelo.
    const [chatHistory, userPreferences] = await Promise.all([
      conversationRepo.getHistory(conversationId), // histórico da conversa
      preferenceRepo.getPreferencesByUserId(userId), // preferencias que o usuário tem salvo no bd
    ]);

    // --- MONTAGEM DO PROMPT DINÂMICO ---
    let systemPrompt =
      "Você é 'Garimpo', um assistente de cinema divertido e especialista. Seu único propósito é ajudar usuários a encontrar os melhores filmes. Responda sempre em português do Brasil. " +
      'Seja direto e conciso. Não use frases de preparação como "Garimpo está se preparando...", "Aguarde um momento..." ou qualquer variação. Vá direto para a resposta final. ' +
      'Use as ferramentas disponíveis para buscar informações. ' +
      'Passe os nomes de filmes, atores, diretores e gêneros para as ferramentas EXATAMENTE como o usuário escreveu ou como eles apareceram em resultados anteriores. Não tente traduzir nada.';

    const fullHistory: (SystemMessage | HumanMessage | AIMessage | ToolMessage)[] = [
      new SystemMessage(systemPrompt),
    ];

    // Se houver preferências, criamos uma mensagem "falsa" do usuário.
    if (userPreferences) {
      const preferenceParts: string[] = [];

      // Preferências POSITIVAS
      if (userPreferences.favorite_genres?.length > 0) {
        preferenceParts.push(
          `meus gêneros favoritos são: ${userPreferences.favorite_genres.join(', ')}`
        );
      }
      if (userPreferences.favorite_actors?.length > 0) {
        preferenceParts.push(
          `meus atores favoritos são: ${userPreferences.favorite_actors.join(', ')}`
        );
      }
      if (userPreferences.favorite_directors?.length > 0) {
        preferenceParts.push(
          `meus diretores favoritos são: ${userPreferences.favorite_directors.join(', ')}`
        );
      }
      if (userPreferences.favorite_movies?.length > 0) {
        preferenceParts.push(
          `meus filmes favoritos salvos são: ${userPreferences.favorite_movies.join(', ')}`
        );
      }
      if (userPreferences.favorite_decades?.length > 0) {
        preferenceParts.push(
          `minhas décadas favoritas são: ${userPreferences.favorite_decades.join(', ')}`
        );
      }
      if (userPreferences.movie_moods?.length > 0) {
        preferenceParts.push(
          `geralmente gosto de filmes com estas 'vibes': ${userPreferences.movie_moods.join(', ')}`
        );
      }

      // Preferências NEGATIVAS
      if (userPreferences.disliked_genres?.length > 0) {
        preferenceParts.push(
          `os gêneros que eu NÃO gosto são: ${userPreferences.disliked_genres.join(', ')}`
        );
      }
      if (userPreferences.disliked_actors?.length > 0) {
        preferenceParts.push(
          `os atores que eu NÃO gosto são: ${userPreferences.disliked_actors.join(', ')}`
        );
      }

      // Anotações
      if (userPreferences.other_notes?.length > 0) {
        preferenceParts.push(`outras anotações: "${userPreferences.other_notes.join('; ')}"`);
      }

      // SÓ DEPOIS DE COLETAR TUDO, CRIA A STRING E ENVIA PARA A IA
      if (preferenceParts.length > 0) {
        const prefsString = `Lembre-se das minhas preferências: ${preferenceParts.join('. ')}.`; // Usei ponto para separar melhor.
        fullHistory.push(new HumanMessage(prefsString));
        fullHistory.push(new AIMessage('Entendido, guardei suas preferências!'));
      }
    }

    fullHistory.push(...chatHistory);

    // O agente agora é chamado com o histórico já enriquecido.
    const stream = runRobustAgent(fullHistory, userId);

    for await (const event of stream) {
      if (event.type === 'status') {
        sendEvent(event);
      } else if (event.type === 'chunk' && event.content) {
        finalAnswer += event.content;
        sendEvent(event);
      }
    }

    if (finalAnswer) {
      await conversationRepo.addMessage(conversationId, 'ai', finalAnswer);
      console.log(`[Stream] Resposta completa salva no DB para a conversa ${conversationId}.`);
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
