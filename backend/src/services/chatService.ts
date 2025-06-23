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
import crypto from 'crypto';

// --- CONFIGURAÇÃO DOS MODELOS E FERRAMENTAS ---

// Configura o modelo de linguagem principal (LLM) que será usado para o chat.
// 'temperature: 0' torna as respostas mais determinísticas e menos criativas.
const llm = new ChatOpenAI({
  modelName: 'gpt-4o',
  temperature: 0,
  openAIApiKey: config.OPENAI_API_KEY,
});

// Cria uma versão do LLM "vinculada" (bound) às ferramentas disponíveis.
// Isso informa ao modelo quais ferramentas ele pode chamar.
const llmWithTools = llm.bind({
  tools: toolSchemas,
});

// Uma instância separada do LLM para a IA Narradora de Status.
// Usa uma temperatura maior (0.5) para gerar mensagens de status mais criativas e variadas.
const statusNarratorLlm = new ChatOpenAI({
  modelName: 'gpt-4o',
  temperature: 0.5,
  openAIApiKey: config.OPENAI_API_KEY,
});

/**
 * Gera uma mensagem de status criativa e temática usando a IA, de forma assíncrona.
 * Esta função cria uma experiência de usuário mais imersiva enquanto o backend trabalha.
 * @param {string} technicalMessage - A descrição técnica da ação atual (ex: "Analisando sua pergunta.").
 * @param {string} [toolName] - O nome da ferramenta que está sendo usada (se houver).
 * @param {any} [toolArgs] - Os argumentos passados para a ferramenta (se houver).
 * @returns {Promise<string>} Uma promessa que resolve para a mensagem de status criativa gerada pela IA.
 */
const generateStatusMessage = async (
  technicalMessage: string,
  toolName?: string,
  toolArgs?: any
): Promise<string> => {
  const safeArgs = { ...toolArgs };
  // Remove o ID do usuário dos argumentos para não enviá-lo à OpenAI.
  if (safeArgs.userId) {
    delete safeArgs.userId;
  }
  // Converte os argumentos restantes em uma string JSON para incluir no prompt.
  const argsJson = Object.keys(safeArgs).length > 0 ? JSON.stringify(safeArgs) : 'N/A';

  // O prompt que instrui a IA narradora ("Garimpo") a criar a mensagem de status.
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
    // Chama a IA narradora em modo de streaming.
    const stream = await statusNarratorLlm.stream(finalPrompt);
    let narratorResponseContent = '';
    // Concatena os pedaços (chunks) da resposta da IA.
    for await (const chunk of stream) {
      narratorResponseContent += chunk.content;
    }

    // Limpa a resposta final, removendo espaços em branco extras e aspas.
    return narratorResponseContent.trim().replace(/"/g, '');
  } catch (e) {
    // Em caso de erro com a API da OpenAI, loga o erro e retorna uma mensagem padrão.
    console.error('Erro ao gerar mensagem de status com a IA, usando fallback.', e);
    return 'Garimpando...'; // Fallback em caso de erro.
  }
};

/**
 * Orquestra a lógica principal do agente de IA. É uma função geradora assíncrona,
 * o que permite "yield" (produzir) eventos em tempo real (como chunks de texto, status, etc.)
 * para o cliente, em vez de esperar todo o processamento terminar.
 * @param {(HumanMessage | AIMessage | SystemMessage | ToolMessage | AIMessageChunk)[]} initialHistory - O histórico completo da conversa até o momento.
 * @param {string} userId - O ID do usuário atual, necessário para executar ferramentas que dependem de preferências.
 * @returns {AsyncGenerator<any>} Um gerador que produz objetos de evento para o frontend.
 */
const runRobustAgent = async function* (
  initialHistory: (HumanMessage | AIMessage | SystemMessage | ToolMessage | AIMessageChunk)[],
  userId: string
): AsyncGenerator<any> {
  // Define um número máximo de "turnos" (IA pensa -> usa ferramenta) para evitar loops infinitos.
  const MAX_TURNS = 3;
  // Cria uma cópia do histórico inicial para poder modificá-la durante a execução.
  let history = [...initialHistory];
  // Flag para controlar se uma resposta final foi gerada com sucesso.
  let finalAnswerGenerated = false;

  // Gera um ID único para este processo de agente, útil para rastreamento no frontend.
  const processId = crypto.randomUUID();
  // Envia o primeiro evento, sinalizando o início do processo.
  yield { type: 'process_start', processId };

  // Array para acumular os "pensamentos" (chamadas de ferramenta) do agente.
  const realtimeThoughtLog = [];

  // LOG 0: Loga o estado inicial para fins de depuração.
  console.log('--- [LOG 0] INÍCIO DO AGENTE ---');
  console.log('Histórico Inicial Recebido:', JSON.stringify(history, null, 2));

  // Loop principal do agente. Cada iteração é um "turno" de pensamento.
  for (let currentTurn = 1; currentTurn <= MAX_TURNS; currentTurn++) {
    // LOG 1: Loga o estado do histórico no início de cada turno.
    console.log(`\n\n--- [LOG 1] INÍCIO DO TURNO #${currentTurn} ---`);
    console.log('Histórico Atual:', JSON.stringify(history, null, 2));

    // No primeiro turno, gera uma mensagem de status inicial.
    if (currentTurn === 1) {
      yield { type: 'status', message: await generateStatusMessage('Analisando sua pergunta.') };
    }

    // Chama o LLM com as ferramentas e o histórico atual, em modo de streaming.
    const stream = await llmWithTools.stream(history);

    // Variável para acumular os chunks da resposta da IA.
    let aiMessage: AIMessageChunk | undefined = undefined;

    // Estruturas de dados para gerenciar chamadas de ferramentas de forma concorrente.
    const toolCallBuilders: { name?: string; args?: string; id?: string }[] = []; // Cada item nesse array será um objeto que representa um pedido para uma ferramenta.
    const dispatchedToolPromises: Map<number, Promise<ToolMessage>> = new Map(); // É um "painel de controle" para rastrear as ferramentas que já foram enviados para trabalhar.
    let latestToolIndex = -1; // É um simples contador para saber qual é a ferramenta mais "recente" que a IA está tentando descrever.

    /**
     * Função interna para despachar a execução de uma ferramenta.
     * @param {number} index - O índice da ferramenta a ser executada.
     */
    const dispatchTool = async (index: number) => {
      // Evita despachar a mesma ferramenta duas vezes.
      if (dispatchedToolPromises.has(index)) return;

      const toolToRun = toolCallBuilders[index];
      // Validação para garantir que a ferramenta tem todas as informações necessárias.
      if (!toolToRun || !toolToRun.name || !toolToRun.args || !toolToRun.id) {
        console.warn(`[Agente Robusto] Tentativa de despachar ferramenta #${index} incompleta.`);
        return;
      }

      const toolArgs = JSON.parse(toolToRun.args);

      console.log(`[Agente Robusto] Despachando ferramenta #${index}: ${toolToRun.name}`);
      console.log(`[Agente Robusto] >> Argumentos:`, toolArgs);

      // Executa a ferramenta e mapeia o resultado para um objeto ToolMessage.
      const promise = executeTool(toolToRun.name, { toolArgs, userId }).then(output => {
        // Formata a saída da ferramenta para ser uma string.
        const content =
          typeof output === 'string' || output === null
            ? String(output)
            : JSON.stringify(output, null, 2);

        // LOG 2: Loga o resultado retornado pela ferramenta.
        console.log(`\n--- [LOG 2] RESULTADO DA FERRAMENTA: ${toolToRun.name} ---`);
        console.log('Output:', content);

        // Retorna um objeto ToolMessage, que será adicionado ao histórico da conversa.
        return new ToolMessage({ content, tool_call_id: toolToRun.id! });
      });

      // Armazena a promessa da execução da ferramenta.
      dispatchedToolPromises.set(index, promise);

      // Gera e envia uma mensagem de status temática sobre o uso da ferramenta.
      return {
        type: 'status',
        message: await generateStatusMessage('Preparando a ferramenta.', toolToRun.name, toolArgs),
      };
    };

    // Itera sobre os chunks recebidos do stream da IA.
    for await (const chunk of stream) {
      // Constrói a mensagem completa da IA a partir dos chunks.
      // Isso é o que vai ser salvo no banco de dados
      if (!aiMessage) {
        aiMessage = chunk;
      } else {
        aiMessage = aiMessage.concat(chunk);
      }

      // Se o chunk contiver texto é pq ele ainda não buscou por uma ferramente para utilizar
      if (typeof chunk.content === 'string' && chunk.content.length > 0) {
        yield { type: 'chunk', content: chunk.content };
      }

      // Se o chunk contiver informações sobre chamadas de ferramentas...
      if (chunk.tool_call_chunks) {
        for (const toolChunk of chunk.tool_call_chunks) {
          const { index: toolChunkIndex } = toolChunk;
          if (toolChunkIndex === undefined) continue;

          // Garante que o array de construtores de ferramentas tenha o tamanho necessário.
          while (toolCallBuilders.length <= toolChunkIndex) {
            toolCallBuilders.push({});
          }

          // Monta as informações da chamada da ferramenta (nome, argumentos, id) a partir dos chunks.
          // Pedidos
          const builder = toolCallBuilders[toolChunkIndex];
          if (toolChunk.name) builder.name = (builder.name ?? '') + toolChunk.name;
          if (toolChunk.args) builder.args = (builder.args ?? '') + toolChunk.args;
          if (toolChunk.id) builder.id = (builder.id ?? '') + toolChunk.id;

          // Lógica para despachar ferramentas o mais cedo possível (otimização).
          // Se foi pro próximo index ele pode executar e partir pro próximo pedido
          // executar o latestToolIndex e começar a montar o proximo
          if (toolChunkIndex > latestToolIndex) {
            latestToolIndex = toolChunkIndex;
            // Se esta não for a primeira ferramenta, despacha a anterior.
            if (latestToolIndex > 0) {
              const prevToolToRun = toolCallBuilders[latestToolIndex - 1];

              if (prevToolToRun?.name && prevToolToRun?.args) {
                const logEvent = {
                  type: 'log_step',
                  processId,
                  logType: 'tool_call',
                  payload: {
                    toolName: prevToolToRun.name,
                    toolArgs: JSON.parse(prevToolToRun.args),
                  },
                };
                realtimeThoughtLog.push(logEvent);
                yield logEvent; // Envia o log para o frontend contendo as ferramentas utilizadas
              }
              const statusMessage = await dispatchTool(latestToolIndex - 1);
              if (statusMessage) yield statusMessage;
            }
          }
        }
      }
    }

    // --- Lógica Pós-Stream ---
    // LOG 3: Loga a resposta completa da IA (incluindo as chamadas de ferramenta) para este turno.
    console.log(`\n--- [LOG 3] RESPOSTA COMPLETA DA IA NO TURNO #${currentTurn} ---`);
    console.log(JSON.stringify(aiMessage, null, 2));

    // Adiciona a resposta da IA ao histórico da conversa.
    if (aiMessage) {
      history.push(aiMessage);
    }

    // Verifica se a IA decidiu chamar alguma ferramenta.
    const hasToolCalls = toolCallBuilders.length > 0;

    if (hasToolCalls) {
      // Garante que a última chamada de ferramenta seja logada e despachada.
      const lastToolToRun = toolCallBuilders[latestToolIndex];
      if (lastToolToRun?.name && lastToolToRun?.args) {
        const logEvent = {
          type: 'log_step',
          processId,
          logType: 'tool_call',
          payload: {
            toolName: lastToolToRun.name,
            toolArgs: JSON.parse(lastToolToRun.args),
          },
        };
        realtimeThoughtLog.push(logEvent); // Salva no array.
        yield logEvent; // Envia o log para o frontend.
      }
      // Despacha a última ferramenta.
      const finalStatusMessage = await dispatchTool(latestToolIndex);
      if (finalStatusMessage) {
        yield finalStatusMessage;
      }

      console.log(
        `[Agente Robusto] Aguardando ${dispatchedToolPromises.size} ferramenta(s) em execução...`
      );

      try {
        // Aguarda a conclusão de todas as ferramentas que foram despachadas.
        const toolMessages = await Promise.all(dispatchedToolPromises.values());
        console.log('[Agente Robusto] Todas as ferramentas responderam.');

        // LOG 4: Loga as respostas das ferramentas que serão adicionadas ao histórico.
        console.log(`\n--- [LOG 4] MENSAGENS DE FERRAMENTA PARA O PRÓXIMO TURNO ---`);
        console.log(JSON.stringify(toolMessages, null, 2));

        // Adiciona os resultados das ferramentas ao histórico.
        history.push(...toolMessages);

        // LOG 5: Sinaliza o fim do turno e a continuação para o próximo.
        console.log(
          `\n--- [LOG 5] FIM DO TURNO #${currentTurn}. CONTINUANDO PARA O PRÓXIMO. ---\n`
        );
        // Continua para a próxima iteração do loop.
        continue;
      } catch (error) {
        // Trata erros que podem ocorrer durante a execução das ferramentas.
        console.error('[Agente Robusto] Erro ao executar ferramenta(s):', error);
        if (error instanceof UnknownToolError) {
          // Erro específico para quando a IA tenta chamar uma ferramenta que não existe.
          yield {
            type: 'chunk',
            content: 'Ops! Tentei usar uma picareta que não tenho. Pode reformular sua pergunta?',
          };
        } else {
          // Erro genérico de ferramenta.
          yield { type: 'chunk', content: 'Desculpe, uma ferramenta quebrou. Tente novamente.' };
        }
        // Interrompe a execução do agente em caso de erro.
        return;
      }
    } else {
      // Se não houver chamadas de ferramenta, a resposta da IA é considerada final.
      console.log(
        '[Agente Robusto] Nenhuma chamada de ferramenta detectada. Resposta é considerada final.'
      );
      finalAnswerGenerated = true;
      // LOG 6: Sinaliza que o agente está saindo do loop porque encontrou a resposta.
      console.log(`\n--- [LOG 6] FIM DO TURNO #${currentTurn}. SAINDO DO LOOP. ---`);
      // Sai do loop.
      break;
    }
  }

  // Se uma resposta final foi gerada, envia o evento de fim de processo com o log de pensamentos.
  if (finalAnswerGenerated) {
    yield { type: 'process_end', thoughtLog: realtimeThoughtLog };
  }

  // --- PLANO B ---
  // Este bloco é executado se o loop terminar (atingir MAX_TURNS) sem uma resposta final.
  if (!finalAnswerGenerated) {
    // LOG 7: Loga que o agente esgotou as tentativas e está acionando o Plano B.
    console.log('\n\n--- [LOG 7] AGENTE SAIU DO LOOP SEM RESPOSTA. EXECUTANDO PLANO B. ---');
    console.log('Histórico Final antes do Plano B:', JSON.stringify(history, null, 2));

    console.log(
      '[Agente Robusto] Limite de tentativas atingido ou IA parou. Forçando resposta final.'
    );
    // Envia uma mensagem de status informando ao usuário que está tentando uma abordagem final.
    yield {
      type: 'status',
      message: await generateStatusMessage(
        'Não encontrei de primeira, pensando em como responder...'
      ),
    };
    // Cria um prompt de sistema especial para instruir a IA a gerar uma resposta de desculpas útil.
    const finalPrompt = new SystemMessage(
      'Você não conseguiu encontrar uma resposta usando suas ferramentas. Analise o histórico da conversa e explique ao usuário de forma amigável e concisa que você não pôde completar o pedido. Se possível, sugira uma alternativa. Se o usuário perguntar sobre qualquer outro assunto que não seja filmes, séries ou cinema, recuse educadamente a pergunta e o lembre de seu propósito.'
    );
    // Chama a IA uma última vez com este prompt final.
    const finalResponseStream = await llmWithTools.stream([...history, finalPrompt]);
    // Envia a resposta final em chunks para o cliente.
    for await (const chunk of finalResponseStream) {
      yield { type: 'chunk', content: chunk.content };
    }
  } else {
    // LOG 7 (Alternativo): Loga que o agente terminou com sucesso e o Plano B não foi necessário.
    console.log('\n\n--- [LOG 7] AGENTE SAIU DO LOOP COM SUCESSO. PLANO B IGNORADO. ---');
  }
};

/**
 * Função principal que lida com a requisição do cliente, estabelece um stream de resposta (Server-Sent Events),
 * e orquestra o `runRobustAgent` para gerar e enviar a resposta.
 * @param {string} conversationId - O ID da conversa atual.
 * @param {Response} res - O objeto de resposta do Express.
 */
export const streamResponse = async (conversationId: string, res: Response) => {
  // Configura os cabeçalhos HTTP para Server-Sent Events (SSE).
  res.setHeader('Content-Type', 'text/event-stream'); // conexão que ficará aberta para eu enviar eventos (dados) continuamente
  res.setHeader('Cache-Control', 'no-cache'); // Impede que o navegador ou proxies guardem a resposta em cache (não ter duplicidade de informação)
  res.setHeader('Connection', 'keep-alive'); // Pede para a conexão TCP/IP entre o servidor e o cliente permanecer aberta
  res.flushHeaders(); // Envia esses cabeçalhos (headers) para o cliente imediatamente

  // Função auxiliar para enviar dados no formato SSE.
  const sendEvent = (data: any) => {
    // Verifica se a conexão ainda está aberta antes de escrever.
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  };

  // Variáveis para acumular a resposta final e o log de pensamentos para salvar no DB.
  let finalAnswer = '';
  let thoughtLogToSave: object | null = null; // Variável para guardar o log final.

  try {
    // Extrai o token de sessão dos cookies da requisição e obtém o ID do usuário.
    const token = (res.req as any).cookies.session_id;
    const userId = getUserIdFromToken(token);
    if (!userId) throw new Error('Usuário não autenticado para o stream.');

    // Busca o histórico da conversa e as preferências do usuário do banco de dados, em paralelo.
    const [chatHistory, userPreferences] = await Promise.all([
      conversationRepo.getHistory(conversationId),
      preferenceRepo.getPreferencesByUserId(userId),
    ]);

    // Define o prompt do sistema (a "personalidade" da IA).
    let systemPrompt =
      "Você é 'Garimpo', um assistente de cinema divertido e especialista. Seu único propósito é ajudar usuários a encontrar os melhores filmes. Responda sempre em português do Brasil. " +
      'Seja direto e conciso. Não use frases de preparação como "Garimpo está se preparando...", "Aguarde um momento..." ou qualquer variação. Vá direto para a resposta final. ' +
      'Use as ferramentas disponíveis para buscar informações. ' +
      'Para responder perguntas, primeiro considere: "Qual das minhas ferramentas pode me ajudar a encontrar a resposta mais precisa e atualizada para isso?". Apenas responda diretamente se a pergunta for uma saudação ou algo que não requer dados externos.' +
      'Passe os nomes de filmes, atores, diretores e gêneros para as ferramentas EXATAMENTE como o usuário escreveu ou como eles apareceram em resultados anteriores. Não tente traduzir nada.' +
      'Quando você usar uma ferramenta para buscar filmes por ano, analise os resultados e apresente apenas os filmes que correspondem estritamente ao ano solicitado pelo usuário. Ignore os outros.' +
      'Quando você chamar ferramentas, antes de fazer a chamada, diga que você vai chamar a ferramenta';

    // Monta o histórico completo que será enviado para a IA.
    const fullHistory: (SystemMessage | HumanMessage | AIMessage | ToolMessage)[] = [
      new SystemMessage(systemPrompt),
    ];

    // Se existirem preferências do usuário, formata-as e as adiciona ao histórico.
    // Isso "lembra" a IA sobre as preferências do usuário no início da conversa.
    if (userPreferences) {
      const preferenceParts: string[] = [];
      // Constrói uma string com todas as preferências do usuário.
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

      // Se houver alguma preferência, adiciona um par de mensagens (Humano/IA) ao histórico.
      if (preferenceParts.length > 0) {
        const prefsString = `Lembre-se das minhas preferências: ${preferenceParts.join('. ')}.`;
        fullHistory.push(new HumanMessage(prefsString));
        fullHistory.push(new AIMessage('Entendido, guardei suas preferências!'));
      }
    }

    // Adiciona o histórico da conversa atual.
    fullHistory.push(...chatHistory);

    // Inicia o agente robusto com o histórico completo e o ID do usuário.
    const stream = runRobustAgent(fullHistory, userId);

    // Processa os eventos gerados pelo agente.
    for await (const event of stream) {
      // Se for um evento de status, log ou início, apenas envia para o cliente.
      if (event.type === 'status' || event.type === 'log_step' || event.type === 'process_start') {
        sendEvent(event);
        // Se for um chunk de texto, acumula na resposta final e envia para o cliente.
      } else if (event.type === 'chunk' && event.content) {
        finalAnswer += event.content;
        sendEvent(event);
        // Se for o evento de fim de processo, captura o log de pensamentos.
      } else if (event.type === 'process_end') {
        // Captura o log final para salvar no DB.
        thoughtLogToSave = event.thoughtLog;
      }
    }

    // Após o stream terminar, se uma resposta final foi gerada...
    if (finalAnswer) {
      // ...salva a mensagem da IA e o log de pensamentos no banco de dados.
      await conversationRepo.addMessage(conversationId, 'ai', finalAnswer, thoughtLogToSave);
      console.log(
        `[Stream] Resposta completa e log salvos no DB para a conversa ${conversationId}.`
      );
    }
  } catch (error) {
    // Em caso de qualquer erro no processo, loga o erro e envia um evento de erro para o cliente.
    console.error('Erro durante o processamento do stream:', error);
    sendEvent({ type: 'error', message: 'Ocorreu um erro ao processar sua solicitação.' });
  } finally {
    // Garante que a conexão seja fechada corretamente, enviando um evento final.
    sendEvent({ type: 'close' });
    res.end();
  }
};

/**
 * Gera um título curto e descritivo para uma nova conversa com base na primeira mensagem do usuário.
 * @param {string} firstMessage - A primeira mensagem enviada pelo usuário na conversa.
 * @returns {Promise<string>} Uma promessa que resolve para o título gerado.
 */
export const generateTitle = async (firstMessage: string): Promise<string> => {
  console.log('[chatService] Gerando título para a nova conversa...');
  // Usa uma instância separada e simples do LLM para esta tarefa específica.
  const titleLlm = new ChatOpenAI({
    modelName: 'gpt-4o',
    temperature: 0.3, // Um pouco de criatividade é aceitável aqui.
    openAIApiKey: config.OPENAI_API_KEY,
  });
  // Prompt direto que instrui a IA a criar um título curto.
  const prompt = `Você é um assistente que cria títulos curtos e descritivos (máximo 5 palavras) para conversas, baseado na primeira mensagem do usuário. Responda APENAS com o título, sem nenhuma outra palavra ou pontuação. Mensagem do usuário: "${firstMessage}"`;

  // Chama a IA e acumula a resposta.
  const stream = await titleLlm.stream(prompt);
  let accumulatedContent = '';
  for await (const chunk of stream) {
    accumulatedContent += chunk.content;
  }

  // Limpa o título gerado, removendo espaços e aspas.
  const title = accumulatedContent.trim().replace(/"/g, '');

  console.log(`[chatService] Título gerado: "${title}"`);
  return title;
};
