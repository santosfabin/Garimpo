// No arquivo: frontend/src/components/ThoughtProcess.tsx

import React from 'react';
import ReactMarkdown from 'react-markdown';
import './ThoughtProcess.css';

// Não precisamos mais do mapa de tradução, vamos mostrar os dados brutos
// const toolNameTranslations: { [key: string]: string } = { ... };

interface LogStep {
  logType: 'tool_call' | 'tool_result';
  payload: any;
}

interface ThoughtProcessProps {
  steps: LogStep[];
}

// <<< [NOVO] Função de formatação mais detalhada
const formatLogStep = (step: LogStep): string => {
  if (step.logType === 'tool_call') {
    const toolName = `\`${step.payload.toolName}\``;
    const toolArgs = `\`${JSON.stringify(step.payload.toolArgs)}\``;
    return `**Ação:** Chamar Ferramenta\n- **Ferramenta:** ${toolName}\n- **Argumentos:** ${toolArgs}`;
  }
  if (step.logType === 'tool_result') {
    return `**Ação:** Resultado da Ferramenta\n- **Mensagem:** ${step.payload.message}`;
  }
  return 'Um passo desconhecido ocorreu.';
};

export default function ThoughtProcess({ steps }: ThoughtProcessProps) {
  if (!steps || steps.length === 0) {
    return null;
  }

  return (
    <details className="thought-process">
      <summary className="thought-process-summary">Processo de Pensamento do Garimpo</summary>
      <div className="thought-process-content">
        {steps.map((step, index) => (
          <div key={index} className="log-step">
            <ReactMarkdown>{formatLogStep(step)}</ReactMarkdown>
          </div>
        ))}
      </div>
    </details>
  );
}
