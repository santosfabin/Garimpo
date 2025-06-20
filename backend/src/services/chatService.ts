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
  initialHistory: (HumanMessage | AIMessage | SystemMessage | ToolMessage | AIMessageChunk)[],
  userId: string
): AsyncGenerator<any> {
  const MAX_TURNS = 3;
  let history = [...initialHistory];

  for (let currentTurn = 1; currentTurn <= MAX_TURNS; currentTurn++) {
    console.log(`[Agente Robusto] Iniciando turno de pensamento #${currentTurn}`);
    if (currentTurn === 1) {
      yield { type: 'status', message: await generateStatusMessage('Analisando sua pergunta.') };
    }

    const stream = await llmWithTools.stream(history);

    let aiMessage = undefined;

    // --- Estado para Gerenciar a Execução Concorrente das Ferramentas ---
    // Armazena os pedaços agregados (nome, args, id) para cada chamada de ferramenta.
    const toolCallBuilders: { name?: string; args?: string; id?: string }[] = [];
    // Rastreia as promessas das ferramentas que já foram despachadas para execução.
    const dispatchedToolPromises: Map<number, Promise<ToolMessage>> = new Map();
    // Guarda o maior índice de ferramenta visto até agora no stream.
    let latestToolIndex = -1;

    /**
     * Despacha uma ferramenta para execução assim que ela estiver completa.
     * @param index O índice da ferramenta a ser executada.
     */
    const dispatchTool = async (index: number) => {
      // Evita despachar a mesma ferramenta duas vezes.
      if (dispatchedToolPromises.has(index)) return;

      const toolToRun = toolCallBuilders[index];
      // Garante que temos todos os dados necessários antes de executar.
      if (!toolToRun || !toolToRun.name || !toolToRun.args || !toolToRun.id) {
        console.warn(`[Agente Robusto] Tentativa de despachar ferramenta #${index} incompleta.`);
        return;
      }

      const toolArgs = JSON.parse(toolToRun.args);

      console.log(`[Agente Robusto] Despachando ferramenta #${index}: ${toolToRun.name}`);
      // Informa ao usuário que a ferramenta está sendo usada.

      // Inicia a execução da ferramenta e armazena a promessa.
      // A promessa resolve para um ToolMessage quando a execução termina.
      const promise = executeTool(toolToRun.name, { toolArgs, userId }).then(output => {
        const content =
          typeof output === 'string' || output === null
            ? String(output)
            : JSON.stringify(output, null, 2);

        console.log(``);
        console.log(`[TESTE] RESPOSTA DA FERRAMENTA ${content}`);
        console.log(``);
        return new ToolMessage({ content, tool_call_id: toolToRun.id! });
      });

      dispatchedToolPromises.set(index, promise);
      return {
        type: 'status',
        message: await generateStatusMessage('Usando uma ferramenta.', toolToRun.name, toolArgs),
      };
    };

    // --- Processamento Principal do Stream ---
    for await (const chunk of stream) {
      if (!aiMessage) {
        aiMessage = chunk;
      } else {
        aiMessage = aiMessage.concat(chunk);
      }

      // Se for um pedaço de texto, envie-o diretamente.
      if (typeof chunk.content === 'string' && chunk.content.length > 0) {
        yield { type: 'chunk', content: chunk.content };
      }

      // Se for um pedaço de chamada de ferramenta, processe-o.
      if (chunk.tool_call_chunks) {
        for (const toolChunk of chunk.tool_call_chunks) {
          const { index: toolChunkIndex } = toolChunk;
          if (toolChunkIndex === undefined) continue;

          // Garante que o array de construtores tenha o tamanho necessário.
          while (toolCallBuilders.length <= toolChunkIndex) {
            toolCallBuilders.push({});
          }

          // Agrega os dados do chunk no construtor correspondente.
          const builder = toolCallBuilders[toolChunkIndex];
          if (toolChunk.name) builder.name = (builder.name ?? '') + toolChunk.name;
          if (toolChunk.args) builder.args = (builder.args ?? '') + toolChunk.args;
          if (toolChunk.id) builder.id = (builder.id ?? '') + toolChunk.id;

          // GATILHO: Se um chunk para um NOVO índice de ferramenta chegou,
          // isso significa que a definição da ferramenta anterior está completa.
          if (toolChunkIndex > latestToolIndex) {
            latestToolIndex = toolChunkIndex;
            // Despacha a ferramenta anterior (se não for a primeira).
            if (latestToolIndex > 0) {
              const statusMessage = await dispatchTool(latestToolIndex - 1);
              yield statusMessage;
            }
          }
        }
      }
    }

    // --- Lógica Pós-Stream ---
    if (aiMessage) {
      history.push(aiMessage); // Adiciona a resposta completa da IA ao histórico.
    }

    if (toolCallBuilders.length > 0) {
      // GATILHO FINAL: O fim do stream é o gatilho para despachar a última ferramenta.
      await dispatchTool(latestToolIndex);

      console.log(
        `[Agente Robusto] Aguardando ${dispatchedToolPromises.size} ferramenta(s) em execução...`
      );

      try {
        // Aguarda todas as ferramentas despachadas (que rodam em paralelo) terminarem.
        const toolMessages = await Promise.all(dispatchedToolPromises.values());
        console.log('[Agente Robusto] Todas as ferramentas responderam.');

        // Adiciona os resultados das ferramentas ao histórico e continua o ciclo.
        history.push(...toolMessages);
        continue;
      } catch (error) {
        console.error('[Agente Robusto] Erro ao executar ferramenta(s):', error);
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
    }

    // Se o modelo parou sem dar resposta ou ferramenta, quebra o loop.
    break;
  }

  // --- PLANO B ---
  console.log(
    '[Agente Robusto] Limite de tentativas atingido ou IA parou. Forçando resposta final.'
  );
  yield {
    type: 'status',
    message: await generateStatusMessage(
      'Não encontrei de primeira, pensando em como responder...'
    ),
  };
  const finalPrompt = new SystemMessage(
    'Você não conseguiu encontrar uma resposta usando suas ferramentas. Analise o histórico da conversa e explique ao usuário de forma amigável e concisa que você não pôde completar o pedido. Se possível, sugira uma alternativa.'
  );
  const finalResponseStream = await llmWithTools.stream([...history, finalPrompt]);
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
      'Passe os nomes de filmes, atores, diretores e gêneros para as ferramentas EXATAMENTE como o usuário escreveu ou como eles apareceram em resultados anteriores. Não tente traduzir nada.' +
      'Quando você chamar ferramentas, antes de fazer a chamada, diga que você vai chamar a ferramenta';

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
