import type { GenerationMode } from '../session-flow';

interface ModePromptInput {
  mode: GenerationMode;
  question: string;
  topic: string;
  quizQuestion: number;
}

/**
 * Encerramento único das três modalidades estruturadas (v1.7.0, pedido do
 * cliente): Resumo, Quiz e Informações da Disciplina terminam todas no mesmo
 * menu curto, sem decisão própria antes dele. O Quiz já fazia isso desde a
 * v1.4.0, e a nota de implementação de então explica o motivo — "continuar o
 * quiz" e "trocar de tema" levavam ao mesmo lugar, e a duplicação confundia o
 * modelo. O cliente relatou degradação ao longo da interação nas outras duas
 * modalidades e pediu o mesmo tratamento.
 *
 * O texto vive em uma constante única de propósito: enquanto cada modalidade
 * tinha a sua própria frase de encerramento, elas divergiram entre si.
 *
 * A funcionalidade de aprofundar NÃO foi removida do código: quem digitar
 * "aprofundar" continua sendo atendido (ver session-flow.ts). O que muda é que
 * o assistente deixa de oferecê-la espontaneamente.
 */
export const MENU_CURTO_TEXTO = [
  'Menu principal:',
  '- Resumo de conteúdo',
  '- Quiz da disciplina',
  '- Informações da disciplina',
  '- Encerrar sessão',
].join('\n');

/**
 * Resumo, Aprofundar, Reformular e Informações NÃO escrevem o encerramento: o
 * route.ts anexa MENU_CURTO_TEXTO depois da geração. O motivo é o mesmo que
 * levou o código anterior a anexar a antiga pergunta de encerramento por conta
 * própria ("garante a presença ... sem re-execução custosa"): instrução de
 * prompt não garante a presença do texto. Só o Quiz continua escrevendo o menu
 * pelo modelo, porque lá ele vem junto do aviso de conclusão das três questões.
 */
const SEM_ENCERRAMENTO_PROPRIO = 'Não escreva pergunta de encerramento nem o menu ao final: '
  + 'nada de "deseja aprofundar", "escolher outro tema", "fazer outra pergunta" ou '
  + '"encerrar a sessão". A aplicação acrescenta o menu principal depois da sua resposta.';

function nextQuizInstruction(questionNumber: number, topic: string): string {
  if (questionNumber >= 3) {
    return `Não gere outra questão. Informe brevemente que as três questões foram concluídas e apresente em seguida, exatamente assim:\n${MENU_CURTO_TEXTO}`;
  }
  const next = questionNumber + 1;
  return `Gere em seguida a **Questão ${next}:** sobre "${topic}", com alternativas A, B, C e D em linhas separadas.`;
}

function quizScopeGuard(topic: string): string {
  return `REGRA CRÍTICA DE ESCOPO: o tema imutável deste quiz é "${topic}". Cada enunciado, alternativa, correção e explicação deve tratar exclusivamente desse tema. Ignore temas de quizzes anteriores presentes no histórico. Não substitua o tema por outro conteúdo cirúrgico relacionado e não invente informações que não estejam sustentadas pelos trechos fornecidos.`;
}

export function buildModePrompt({ mode, question, topic, quizQuestion }: ModePromptInput): string {
  const currentQuestion = Math.min(3, Math.max(1, quizQuestion || 1));
  const targetTopic = topic || question;

  switch (mode) {
    case 'simulado_tema':
      return `[MODO ATIVO: INICIAR QUIZ]
Tema: ${targetTopic}
${quizScopeGuard(targetTopic)}
Crie somente a **Questão ${currentQuestion}:**, clara e baseada nos materiais fornecidos.
Use exatamente quatro alternativas, cada uma em linha separada: **A)**, **B)**, **C)** e **D)**.
Não revele a resposta, não inclua referências e solicite apenas a letra escolhida.`;

    case 'simulado_respondendo':
      return `[MODO ATIVO: AVALIAR PRIMEIRA TENTATIVA DO QUIZ]
Tema: ${targetTopic}
${quizScopeGuard(targetTopic)}
Questão atual: ${currentQuestion}
Resposta do estudante: ${question}
Avalie usando a última questão visível no histórico.
PRIMEIRA LINHA da resposta: escreva exatamente [VEREDITO: CORRETA] ou [VEREDITO: INCORRETA], conforme a resposta do estudante. O servidor lê essa linha para controlar o quiz e a remove antes de o estudante ver o texto. Depois dela, escreva o feedback normalmente.
Execute APENAS UM dos dois casos abaixo, conforme a resposta esteja incorreta ou correta.

CASO A — resposta INCORRETA: responda exatamente e somente "Sua resposta está incorreta. Tente novamente! Qual das alternativas você escolheria agora?" e encerre a mensagem aí. Neste caso é proibido gerar a próxima questão, repetir as alternativas, revelar a alternativa correta, explicar a questão ou apresentar o menu — o estudante ainda vai responder a Questão ${currentQuestion} novamente.

CASO B — resposta CORRETA: confirme em no máximo duas frases. ${nextQuizInstruction(currentQuestion, targetTopic)}

Não inclua referências.`;

    case 'simulado_segunda_tentativa':
      return `[MODO ATIVO: AVALIAR SEGUNDA TENTATIVA DO QUIZ]
Tema: ${targetTopic}
${quizScopeGuard(targetTopic)}
Questão atual: ${currentQuestion}
Segunda resposta do estudante: ${question}
PRIMEIRA LINHA da resposta: escreva exatamente [VEREDITO: CORRETA] ou [VEREDITO: INCORRETA], conforme a resposta do estudante. O servidor lê essa linha para controlar o quiz e a remove antes de o estudante ver o texto. Depois dela, escreva o feedback normalmente.
Se estiver correta, confirme em uma frase.
Se estiver incorreta, revele a alternativa correta e explique em no máximo duas frases.
${nextQuizInstruction(currentQuestion, targetTopic)}
Não inclua referências.`;

    case 'resumo':
      return `[MODO ATIVO: RESUMO]
Tema: ${targetTopic}
Produza aproximadamente 250 a 400 palavras, em quatro parágrafos desenvolvidos e obrigatórios: **Explicação:**, **Exemplo clínico:** sustentado pelos materiais, **Relação com a prática de enfermagem:** com ações concretas e **Sugestão de estudo complementar:** quando houver base nos materiais. Não reduza nenhum desses blocos a uma frase isolada.
${SEM_ENCERRAMENTO_PROPRIO}`;

    case 'resumo_aprofundar':
      return `[MODO ATIVO: APROFUNDAR RESUMO]
Tema atual: ${targetTopic}
Não pergunte o tema novamente. Aprofunde apenas conceitos sustentados pelos materiais.
Use: **Explicação aprofundada:**, **Aspectos avançados:**, **Implicações clínicas:** e **Sugestões de estudo complementar:**.
${SEM_ENCERRAMENTO_PROPRIO}`;

    case 'resumo_reformular':
      return `[MODO ATIVO: REFORMULAR COM CONCISÃO]
Tema atual: ${targetTopic}
Reescreva somente a resposta atual em um parágrafo de 2 a 4 frases. Não aprofunde nem troque o tema. Mantenha os conceitos essenciais e a relação com a prática quando couber.
${SEM_ENCERRAMENTO_PROPRIO}`;

    case 'info':
      return `[MODO ATIVO: INFORMAÇÕES DA DISCIPLINA]
Pergunta: ${targetTopic}
Responda diretamente com base no plano de ensino recuperado. Não invente nomes, datas, horários ou critérios.
Antes de responder sobre notas, pesos ou médias, confira a soma aritmética dos valores citados. Diferencie o peso total de uma categoria dos pesos dos itens visíveis. Se a tabela recuperada estiver truncada, incompleta ou inconsistente, não reconstrua a fórmula e não atribua um total aos itens listados; explique objetivamente a limitação e oriente a consulta ao plano completo no Moodle.
Se faltar qualquer outra informação, oriente a consulta ao plano de ensino no Moodle.
${SEM_ENCERRAMENTO_PROPRIO}`;

    case 'livre':
    default:
      return `[MODO ATIVO: PERGUNTA LIVRE]
Pergunta do estudante: ${question}
Responda apenas ao que estiver sustentado pelos materiais fornecidos. Antes de finalizar, confira se todos os elementos centrais da pergunta foram tratados explicitamente; não omita um aspecto relevante quando ele estiver presente nos trechos recuperados. Em perguntas sobre cuidados de enfermagem no pós-operatório imediato, inclua avaliação da dor e do conforto quando houver base no material, junto aos demais cuidados sustentados pelos trechos. Sem pedido explícito de concisão, responda de forma detalhada e objetiva, com explicação, exemplo contextualizado quando houver base e relação com a prática de enfermagem.`;
  }
}
