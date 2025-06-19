import { ChatOpenAI } from '@langchain/openai';
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import config from '../config';
import * as conversationRepo from '../repository/conversationRepository';
import { Response } from 'express';
import { availableTools, toolSchemas } from './tools';

// --- CONFIGURAÇÃO DO MODELO E FERRAMENTAS ---

const llm = new ChatOpenAI({
  modelName: 'gpt-4o',
  temperature: 0,
  openAIApiKey: config.OPENAI_API_KEY,
});

//  FAÇA O BIND DAS FERRAMENTAS (usando a lista de schemas)
// Permite "amarrar" ou "vincular" configurações extras a uma instância do LLM, sem modificar a instância original
const llmWithTools = llm.bind({
  tools: toolSchemas,
});

// --- LÓGICA DO AGENTE ---

const runManualAgent = async (
  chatHistory: (HumanMessage | AIMessage | SystemMessage | ToolMessage)[]
): Promise<AsyncGenerator<any>> => {
  // AsyncGenerator é como uma esteira rolante, onde não é preciso esperar terminar para mandar, ele é enviado continuamente
  const firstResponse = await llmWithTools.invoke(chatHistory);
  /*
    {
          1. O CONTEÚDO PRINCIPAL
      content: '', // <--- Geralmente vazio quando uma ferramenta é chamada
          Se a IA decidir chamar uma ferramenta, este campo geralmente virá vazio (''). A IA não está respondendo ao usuário ainda, ela está primeiro pedindo para você executar uma ação (a ferramenta).
          Se a IA decidir responder diretamente (sem usar ferramenta), este campo conterá a resposta em texto. Ex: content: 'Olá! Sobre qual filme você gostaria de saber?'.

          2. INFORMAÇÕES ADICIONAIS
          Se a IA não quiser usar uma ferramenta, este campo será undefined
      additional_kwargs: {
        tool_calls: [ // <--- A PARTE MAIS IMPORTANTE!
          {
            id: 'call_abc123',
            type: 'function',
            function: {
              name: 'get_movie_details', // O nome da ferramenta que a IA escolheu
              arguments: '{"title":"Matrix"}' // Os argumentos como uma string JSON
            }
          }
              Poderia haver mais chamadas de ferramentas aqui
        ]
      },

          3. METADADOS E OUTRAS INFORMAÇÕES
      response_metadata: {
          ... informações sobre o token, etc.
      },
          ... outras propriedades da LangChain
    }
  */
  const toolCalls = firstResponse.additional_kwargs.tool_calls;

  if (toolCalls && toolCalls.length > 0) {
    console.log(`[Manual Agent] IA solicitou o uso de ${toolCalls.length} ferramenta(s).`);
    const historyForSecondCall = [...chatHistory, firstResponse];
    // Você precisa registrar no histórico que a IA tentou usar uma ferramenta. Sem isso, a IA ficaria confusa na próxima etapa

    const toolOutputs = await Promise.all(
      toolCalls.map(async (toolCall: any) => {
        // 1. Pega o nome e os argumentos da ferramenta
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments);

        console.log(`[Manual Agent] Executando ferramenta: ${toolName} com args:`, toolArgs);

        // 2. Procura a função correspondente no nosso mapa
        const toolToExecute = availableTools[toolName]; // Ex: availableTools['get_movie_details']

        let output: any;

        // 3. Executa a função se ela foi encontrada
        if (toolToExecute) {
          output = await toolToExecute(toolArgs); // Chama a função dinamicamente
        } else {
          output = `Erro: Ferramenta desconhecida '${toolName}'.`;
        }

        // 4. Retorna a mensagem formatada para a IA
        return new ToolMessage({ content: JSON.stringify(output), tool_call_id: toolCall.id });
      })
    );

    /*
      [
        new ToolMessage({
          content: '{"title":"The Matrix","director":"The Wachowskis",...}', // Resultado da primeira ferramenta (em string)
          tool_call_id: 'call_abc' // Ligado à primeira "ordem"
        }),
        ...
      ]
    */

    historyForSecondCall.push(...toolOutputs);
    /*
      1. Usuário perguntou algo.
      2. IA decidiu usar ferramentas.
      3. Aqui estão os resultados dessas ferramentas.
    */

    return llmWithTools.stream(historyForSecondCall);
  } else {
    // Se não houver ferramentas, fazemos o stream da primeira resposta diretamente.
    // Para isso, precisamos de uma função auxiliar para transformar a resposta única em um stream.
    async function* streamFromSingleResponse() {
      yield firstResponse;
    }
    return streamFromSingleResponse();
  }
};

// --- FUNÇÕES EXPORTADAS ---

export const streamResponse = async (conversationId: string, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream'); // conexão que ficará aberta para eu enviar eventos (dados) continuamente
  res.setHeader('Cache-Control', 'no-cache'); // Impede que o navegador ou proxies guardem a resposta em cache (não ter duplicidade de informação)
  res.setHeader('Connection', 'keep-alive'); // Pede para a conexão TCP/IP entre o servidor e o cliente permanecer aberta
  res.flushHeaders(); // Envia esses cabeçalhos (headers) para o cliente imediatamente

  const sendEvent = (data: any) => res.write(`data: ${JSON.stringify(data)}\n\n`); // Escreve dados na conexão aberta

  // Variável para juntar a resposta completa e salvar no DB
  let finalAnswer = '';

  try {
    const chatHistory = await conversationRepo.getHistory(conversationId);
    const fullHistory = [
      new SystemMessage(
        "Você é 'Garimpo', um assistente de cinema divertido e especialista. Seu único propósito é ajudar usuários a encontrar os melhores filmes. Responda sempre em português do Brasil. Se o usuário perguntar sobre qualquer outro assunto que não seja filmes, séries ou cinema, recuse educadamente a pergunta e o lembre de seu propósito."
      ),
      ...chatHistory,
    ];

    // 1. Obtém o stream do agente
    const stream = await runManualAgent(fullHistory);

    // 2. Itera sobre o stream, pedaço por pedaço
    // Está esperando o próximo "pedaço" (chunk) do stream ficar disponível.
    for await (const chunk of stream) {
      // O conteúdo de cada pedaço
      const content = chunk.content?.toString() || '';

      if (content) {
        // Acumula na variável para salvar no final
        finalAnswer += content;
        // Envia o pedaço para o frontend IMEDIATAMENTE
        sendEvent({ type: 'chunk', content });
      }
    }

    // 3. Após o loop terminar, salva a resposta completa no banco
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
