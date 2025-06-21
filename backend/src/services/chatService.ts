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
 * REINTRODUZIDO: Gera uma mensagem de status criativa e temática usando a IA, de forma assíncrona.
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
    const stream = await statusNarratorLlm.stream(finalPrompt);
    let narratorResponseContent = '';
    for await (const chunk of stream) {
      narratorResponseContent += chunk.content;
    }

    return narratorResponseContent.trim().replace(/"/g, '');
  } catch (e) {
    console.error('Erro ao gerar mensagem de status com a IA, usando fallback.', e);
    return 'Garimpando...'; // Fallback em caso de erro.
  }
};

// --- LÓGICA DO AGENTE ROBUSTO (AGORA COM NARRADOR) ---

const runRobustAgent = async function* (
  initialHistory: (HumanMessage | AIMessage | SystemMessage | ToolMessage | AIMessageChunk)[],
  userId: string
): AsyncGenerator<any> {
  const MAX_TURNS = 3;
  let history = [...initialHistory];
  let finalAnswerGenerated = false; // <<< [SOLUÇÃO 1/3] Inicializa a bandeira

  // LOG 0: O que o agente recebeu no início de tudo?
  console.log('--- [LOG 0] INÍCIO DO AGENTE ---');
  console.log('Histórico Inicial Recebido:', JSON.stringify(history, null, 2));

  for (let currentTurn = 1; currentTurn <= MAX_TURNS; currentTurn++) {
    // LOG 1: O que o agente está pensando no início de cada turno?
    console.log(`\n\n--- [LOG 1] INÍCIO DO TURNO #${currentTurn} ---`);
    console.log('Histórico Atual:', JSON.stringify(history, null, 2));

    if (currentTurn === 1) {
      yield { type: 'status', message: await generateStatusMessage('Analisando sua pergunta.') };
    }

    const stream = await llmWithTools.stream(history);

    let aiMessage: AIMessageChunk | undefined = undefined;

    const toolCallBuilders: { name?: string; args?: string; id?: string }[] = [];
    const dispatchedToolPromises: Map<number, Promise<ToolMessage>> = new Map();
    let latestToolIndex = -1;

    const dispatchTool = async (index: number) => {
      if (dispatchedToolPromises.has(index)) return;

      const toolToRun = toolCallBuilders[index];
      if (!toolToRun || !toolToRun.name || !toolToRun.args || !toolToRun.id) {
        console.warn(`[Agente Robusto] Tentativa de despachar ferramenta #${index} incompleta.`);
        return;
      }

      const toolArgs = JSON.parse(toolToRun.args);

      console.log(`[Agente Robusto] Despachando ferramenta #${index}: ${toolToRun.name}`);
      console.log(`[Agente Robusto] >> Argumentos:`, toolArgs); // Adicione esta linha

      console.log(`[Agente Robusto] Despachando ferramenta #${index}: ${toolToRun.name}`);
      const promise = executeTool(toolToRun.name, { toolArgs, userId }).then(output => {
        const content =
          typeof output === 'string' || output === null
            ? String(output)
            : JSON.stringify(output, null, 2);

        // LOG 2: O que a ferramenta retornou?
        console.log(`\n--- [LOG 2] RESULTADO DA FERRAMENTA: ${toolToRun.name} ---`);
        console.log('Output:', content);

        return new ToolMessage({ content, tool_call_id: toolToRun.id! });
      });

      dispatchedToolPromises.set(index, promise);
      return {
        type: 'status',
        message: await generateStatusMessage('Usando uma ferramenta.', toolToRun.name, toolArgs),
      };
    };

    for await (const chunk of stream) {
      if (!aiMessage) {
        aiMessage = chunk;
      } else {
        aiMessage = aiMessage.concat(chunk);
      }

      if (typeof chunk.content === 'string' && chunk.content.length > 0) {
        yield { type: 'chunk', content: chunk.content };
      }

      if (chunk.tool_call_chunks) {
        for (const toolChunk of chunk.tool_call_chunks) {
          const { index: toolChunkIndex } = toolChunk;
          if (toolChunkIndex === undefined) continue;

          while (toolCallBuilders.length <= toolChunkIndex) {
            toolCallBuilders.push({});
          }

          const builder = toolCallBuilders[toolChunkIndex];
          if (toolChunk.name) builder.name = (builder.name ?? '') + toolChunk.name;
          if (toolChunk.args) builder.args = (builder.args ?? '') + toolChunk.args;
          if (toolChunk.id) builder.id = (builder.id ?? '') + toolChunk.id;

          if (toolChunkIndex > latestToolIndex) {
            latestToolIndex = toolChunkIndex;
            if (latestToolIndex > 0) {
              const statusMessage = await dispatchTool(latestToolIndex - 1);
              yield statusMessage;
            }
          }
        }
      }
    }

    // --- Lógica Pós-Stream ---
    // LOG 3: Qual foi a resposta completa da IA neste turno?
    console.log(`\n--- [LOG 3] RESPOSTA COMPLETA DA IA NO TURNO #${currentTurn} ---`);
    console.log(JSON.stringify(aiMessage, null, 2));

    if (aiMessage) {
      history.push(aiMessage);
    }

    const hasToolCalls = toolCallBuilders.length > 0;

    if (hasToolCalls) {
      // GATILHO FINAL: O fim do stream é o gatilho para despachar a última ferramenta.
      const finalStatusMessage = await dispatchTool(latestToolIndex);
      if (finalStatusMessage) {
        yield finalStatusMessage;
      }

      console.log(
        `[Agente Robusto] Aguardando ${dispatchedToolPromises.size} ferramenta(s) em execução...`
      );

      try {
        // Aguarda todas as ferramentas despachadas (que rodam em paralelo) terminarem.
        const toolMessages = await Promise.all(dispatchedToolPromises.values());
        console.log('[Agente Robusto] Todas as ferramentas responderam.');

        // LOG 4: Quais mensagens de ferramenta serão adicionadas ao histórico?
        console.log(`\n--- [LOG 4] MENSAGENS DE FERRAMENTA PARA O PRÓXIMO TURNO ---`);
        console.log(JSON.stringify(toolMessages, null, 2));

        history.push(...toolMessages);

        // LOG 5: O agente vai continuar para o próximo turno.
        console.log(
          `\n--- [LOG 5] FIM DO TURNO #${currentTurn}. CONTINUANDO PARA O PRÓXIMO. ---\n`
        );
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
    } else {
      // <<< [SOLUÇÃO 2/3] Se não há 'tool_calls', a IA deu uma resposta final.
      // A resposta já foi enviada via 'yield' no loop do stream.
      // Portanto, levantamos a bandeira e saímos.
      console.log(
        '[Agente Robusto] Nenhuma chamada de ferramenta detectada. Resposta é considerada final.'
      );
      finalAnswerGenerated = true;
      // LOG 6: O agente vai sair do loop.
      console.log(`\n--- [LOG 6] FIM DO TURNO #${currentTurn}. SAINDO DO LOOP. ---`);
      break;
    }
  }

  // --- PLANO B ---
  // <<< [SOLUÇÃO 3/3] O Plano B só é executado se a bandeira não foi levantada.
  if (!finalAnswerGenerated) {
    // LOG 7: O que aconteceu depois que o loop principal terminou?
    console.log('\n\n--- [LOG 7] AGENTE SAIU DO LOOP SEM RESPOSTA. EXECUTANDO PLANO B. ---');
    console.log('Histórico Final antes do Plano B:', JSON.stringify(history, null, 2));

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
      'Você não conseguiu encontrar uma resposta usando suas ferramentas. Analise o histórico da conversa e explique ao usuário de forma amigável e concisa que você não pôde completar o pedido. Se possível, sugira uma alternativa. Se o usuário perguntar sobre qualquer outro assunto que não seja filmes, séries ou cinema, recuse educadamente a pergunta e o lembre de seu propósito.'
    );
    const finalResponseStream = await llmWithTools.stream([...history, finalPrompt]);
    for await (const chunk of finalResponseStream) {
      yield { type: 'chunk', content: chunk.content };
    }
  } else {
    console.log('\n\n--- [LOG 7] AGENTE SAIU DO LOOP COM SUCESSO. PLANO B IGNORADO. ---');
  }
};

// --- FUNÇÕES EXPORTADAS ---

export const streamResponse = async (conversationId: string, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

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

    const [chatHistory, userPreferences] = await Promise.all([
      conversationRepo.getHistory(conversationId),
      preferenceRepo.getPreferencesByUserId(userId),
    ]);

    let systemPrompt =
      "Você é 'Garimpo', um assistente de cinema divertido e especialista. Seu único propósito é ajudar usuários a encontrar os melhores filmes. Responda sempre em português do Brasil. " +
      'Seja direto e conciso. Não use frases de preparação como "Garimpo está se preparando...", "Aguarde um momento..." ou qualquer variação. Vá direto para a resposta final. ' +
      'Use as ferramentas disponíveis para buscar informações. ' +
      'Para responder perguntas, primeiro considere: "Qual das minhas ferramentas pode me ajudar a encontrar a resposta mais precisa e atualizada para isso?". Apenas responda diretamente se a pergunta for uma saudação ou algo que não requer dados externos.' +
      'Passe os nomes de filmes, atores, diretores e gêneros para as ferramentas EXATAMENTE como o usuário escreveu ou como eles apareceram em resultados anteriores. Não tente traduzir nada.' +
      'Quando você usar uma ferramenta para buscar filmes por ano, analise os resultados e apresente apenas os filmes que correspondem estritamente ao ano solicitado pelo usuário. Ignore os outros.' +
      'Quando você chamar ferramentas, antes de fazer a chamada, diga que você vai chamar a ferramenta';

    const fullHistory: (SystemMessage | HumanMessage | AIMessage | ToolMessage)[] = [
      new SystemMessage(systemPrompt),
    ];

    if (userPreferences) {
      const preferenceParts: string[] = [];

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

      if (preferenceParts.length > 0) {
        const prefsString = `Lembre-se das minhas preferências: ${preferenceParts.join('. ')}.`;
        fullHistory.push(new HumanMessage(prefsString));
        // AQUI ESTÁ A CORREÇÃO
        fullHistory.push(new AIMessage('Entendido, guardei suas preferências!'));
      }
    }

    fullHistory.push(...chatHistory);

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

  const stream = await titleLlm.stream(prompt);
  let accumulatedContent = '';
  for await (const chunk of stream) {
    accumulatedContent += chunk.content;
  }

  const title = accumulatedContent.trim().replace(/"/g, '');

  console.log(`[chatService] Título gerado: "${title}"`);
  return title;
};
