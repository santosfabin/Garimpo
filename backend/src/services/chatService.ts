// src/services/chatService.ts

import { ChatOpenAI } from '@langchain/openai';
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import config from '../config';
import * as conversationRepo from '../repository/conversationRepository';
import { Response } from 'express';
// Importações simplificadas: só precisamos dos schemas e do orquestrador
import { toolSchemas, executeTool } from './tools'; // Assumindo que você tem este arquivo `tools.ts`
import { getUserIdFromToken } from '../utils/getUserIdFromToken';
import * as preferenceRepo from '../repository/preferenceRepository';

// --- CONFIGURAÇÃO DO MODELO E FERRAMENTAS ---

const llm = new ChatOpenAI({
  modelName: 'gpt-4o',
  temperature: 0,
  openAIApiKey: config.OPENAI_API_KEY,
});

//  FAÇA O BIND DAS FERRAMENTAS (usando a lista de schemas)
// Permite "amarrar" ou "vincular" configurações extras a uma instância do LLM, sem modificar a instância original
const llmWithTools = llm.bind({
  tools: toolSchemas, // Usa a lista de schemas importada de tools.ts
});

// --- FUNÇÃO: IA NARRADORA DE STATUS ---
const statusNarratorLlm = new ChatOpenAI({
  modelName: 'gpt-4o',
  temperature: 0.5,
  openAIApiKey: config.OPENAI_API_KEY,
});

/**
 * Gera uma mensagem de status criativa e temática usando a IA.
 * @param technicalMessage - A descrição técnica da ação (ex: "Analisando a pergunta.").
 * @param toolName - Opcional: o nome da ferramenta que está sendo usada.
 * @param toolArgs - Opcional: os argumentos da ferramenta.
 * @returns Uma string com a mensagem de status para o usuário.
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

  // PROMPT FINAL, COM SINTAXE CORRIGIDA E REFORÇO NO TEMA
  const finalPrompt = `Você é "Garimpo", um narrador de status para um chatbot de filmes. Sua única missão é criar uma frase curta (1 a 7 palavras) para o usuário ler enquanto aguarda.

Siga estas regras RÍGIDAS para criar a frase:

**REGRA 1: TEMA OBRIGATÓRIO.**
A frase DEVE usar uma metáfora relacionada a garimpo, mineração, escavação ou geologia. Este é o tema principal. O tema "cinema" é secundário e só deve ser usado se combinado com o principal.
- **Correto:** "Garimpando filmes de Ação", "Analisando a gema 'Matrix'".
- **Incorreto:** "Luzes, câmera, ação!", "Editando a cena...".

**REGRA 2: FOCO NA AÇÃO ATUAL.**
Sua frase deve refletir a ação que estou te passando.
- **Ação Técnica Atual:** "${technicalMessage}"
- **Ferramenta Usada:** "${toolName || 'Nenhuma'}"
- **Argumentos:** ${argsJson}

**REGRA 3: TRADUZA A FERRAMENTA.**
Se uma ferramenta for usada, TRADUZA o nome técnico dela para uma ação de garimpo.
- "search_" ou "discover_" se tornam "Garimpando", "Escavando", "Explorando veio de..."
- "get_" ou "details" se tornam "Analisando a gema...", "Polindo a pepita..."

**REGRA 4: SEJA CURTO E DIRETO.**
Sua resposta deve ser APENAS a frase final, sem explicações, saudações ou emojis.

**Exemplo de Processo:**
- **Input:** Ferramenta="get_movie_details", Argumentos={"title":"Duna"}
- **Pensamento:** A ferramenta é 'get_details'. A metáfora é 'Analisando a gema'. O argumento é 'Duna'.
- **Resultado:** "Analisando a gema 'Duna'..."

Agora, aplique estas regras e gere a frase.`;

  try {
    const response = await statusNarratorLlm.invoke(finalPrompt);
    return response.content.toString().trim().replace(/"/g, '');
  } catch (e) {
    console.error('Erro ao gerar mensagem de status com a IA, usando fallback.', e);
    return 'Garimpando...'; // Fallback simples
  }
};

// --- LÓGICA DO AGENTE ---

const runManualAgent = async function* (
  chatHistory: (HumanMessage | AIMessage | SystemMessage | ToolMessage)[],
  userId: string
): AsyncGenerator<any> {
  // AsyncGenerator é como uma esteira rolante, onde não é preciso esperar terminar para mandar, ele é enviado continuamente

  // Emite o primeiro status
  yield {
    type: 'status',
    message: await generateStatusMessage('Analisando a pergunta inicial do usuário.'),
  };

  const firstResponse = await llmWithTools.invoke(chatHistory);
  const toolCalls = firstResponse.additional_kwargs.tool_calls;

  if (toolCalls && toolCalls.length > 0) {
    console.log(`[Manual Agent] IA solicitou o uso de ${toolCalls.length} ferramenta(s).`);

    const historyForSecondCall = [...chatHistory, firstResponse];

    // Emite o status de cada ferramenta ANTES de executá-las
    for (const toolCall of toolCalls) {
      const toolName = toolCall.function.name;
      const toolArgs = JSON.parse(toolCall.function.arguments);
      yield {
        type: 'status',
        message: await generateStatusMessage('Vou usar uma ferramenta agora.', toolName, toolArgs),
      };
      await new Promise(resolve => setTimeout(resolve, 300)); // Pequena pausa para UX
    }

    // Agora, executamos todas as ferramentas em paralelo
    const toolOutputs = await Promise.all(
      toolCalls.map(async (toolCall: any) => {
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments);

        console.log(`[Manual Agent] Executando ferramenta: ${toolName} com args:`, toolArgs);

        const output = await executeTool(toolName, { toolArgs, userId });

        const content =
          typeof output === 'string' || output === null ? String(output) : JSON.stringify(output);

        const toolMessage = new ToolMessage({ content, tool_call_id: toolCall.id });
        console.log('[DEBUG] ToolMessage a ser enviada:', toolMessage);
        return toolMessage;
      })
    );

    historyForSecondCall.push(...toolOutputs);

    // Emite o status de que está formulando a resposta final
    yield {
      type: 'status',
      message: await generateStatusMessage(
        'Já coletei os dados. Agora estou montando a melhor resposta para você.'
      ),
    };

    // Faz a segunda chamada à IA e faz o stream da resposta, emitindo cada chunk.
    const finalStream = await llmWithTools.stream(historyForSecondCall);
    for await (const chunk of finalStream) {
      // Emitimos um objeto padronizado para o consumidor da função
      yield { type: 'chunk', content: chunk.content };
    }
  } else {
    // Se não houver ferramentas, fazemos o stream da primeira resposta diretamente.
    const stream = await llmWithTools.stream(chatHistory);
    for await (const chunk of stream) {
      // Emitimos um objeto padronizado para o consumidor da função
      yield { type: 'chunk', content: chunk.content };
    }
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
      "Para encontrar os 'piores' filmes ou filmes com 'notas baixas', use a ferramenta 'discover_movies' com o parâmetro 'sortBy' como 'vote_average.asc' e defina um 'maxRating'. " +
      'Passe os nomes de filmes, atores, diretores e gêneros para as ferramentas EXATAMENTE como o usuário escreveu ou como eles apareceram em resultados anteriores. Não tente traduzir nada.';

    const fullHistory: (SystemMessage | HumanMessage | AIMessage | ToolMessage)[] = [
      new SystemMessage(systemPrompt),
    ];

    if (userPreferences) {
      // Seu código de montagem de preferências vai aqui...
    }

    fullHistory.push(...chatHistory);

    const stream = runManualAgent(fullHistory, userId);

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
