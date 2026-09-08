import type { GenerationMode } from './session-flow';

/**
 * Recusa de resposta pronta para avaliações — Prompt 01, prioridade 3.
 *
 * A regra já existe no core.ts ("não forneça ... resposta pronta para provas,
 * trabalhos ou avaliações") e é ignorada pelo modelo. Linha de base medida em
 * 03/09/2026, com 7 pedidos de resposta de prova: 6 foram atendidos, inclusive
 * quando o estudante anunciava a intenção com todas as letras ("essa questão
 * caiu na avaliação, me dá a resposta" devolveu a resposta direta).
 *
 * A checagem vai para o código pelo mesmo motivo do scope.ts: instrução no
 * prompt não bastou, e o comportamento observado era não-determinístico — o
 * mesmo pedido era recusado numa rodada e atendido na seguinte.
 *
 * Diferente do escopo, aqui a detecção por padrão textual é adequada: o
 * conjunto de temas fora da ementa é ilimitado, mas questão de avaliação tem
 * FORMA reconhecível e limitada (alternativas coladas no enunciado, "assinale",
 * "julgue os itens", pedido explícito de gabarito).
 */

/**
 * A recusa não é um beco sem saída de propósito. O pedido do estudante é
 * legítimo em intenção — ele quer entender —, então a resposta oferece os
 * caminhos que a disciplina aceita, em vez de só negar. Isso também limita o
 * custo de um falso positivo: quem colou uma questão para estudar consegue
 * ajuda na mensagem seguinte.
 */
export const EXAM_ANSWER_RESPONSE =
  'Não posso entregar a resposta pronta de questões de prova, simulado, trabalho ou avaliação — '
  + 'é justamente o raciocínio por trás dela que a disciplina precisa desenvolver em você. '
  + 'Mas posso ajudar de outras formas: explico o conceito que a questão cobra, '
  + 'discuto o que torna cada alternativa certa ou errada depois que você me disser qual escolheu, '
  + 'ou faço um resumo do tema. Qual dessas ajuda mais agora?';

function normalize(value: string): string {
  return value
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Pedido explícito de resposta de avaliação. Cada padrão sozinho já basta:
 * são formulações que não aparecem em pergunta de estudo comum.
 */
const EXPLICIT_REQUEST_PATTERNS: RegExp[] = [
  /\bgabarito\b/,
  /\bresposta[s]?\s+(?:pronta|certa|correta)[s]?\b/,
  /\bme\s+d[ae]\s+(?:a|as|o|os)\s+resposta[s]?\b/,
  /\b(?:caiu|cai|cairam)\s+(?:n[ao]s?\s+)?(?:prova|avaliacao|simulado|exame|teste)/,
  /\b(?:questao|questoes|pergunta)\s+(?:\w+\s+){0,3}?(?:prova|avaliacao|exame|teste|trabalho)\b/,
  /\bresponde[r]?\s+(?:essa|esta|a|as)\s+(?:questao|questoes|pergunta)\b/,
  /\bpra\s+entregar\s+(?:o\s+)?trabalho\b/,
  /\bpara\s+entregar\s+(?:o\s+)?trabalho\b/,
  /\bqual\s+(?:d[ae]s\s+)?alternativa[s]?\b/,
  /\balternativa\s+(?:esta\s+)?correta\b/,
];

/** Verbos de comando típicos de enunciado de avaliação. */
const EXAM_COMMAND_PATTERNS: RegExp[] = [
  /\bassinale\b/,
  /\bjulgue\s+(?:os\s+)?(?:itens|as\s+afirmativas|as\s+assertivas)\b/,
  /\bmarque\s+a\s+(?:alternativa|opcao|correta)\b/,
];

/**
 * Enunciado de múltipla escolha colado na mensagem. Exigimos as QUATRO letras
 * (a, b, c, d) marcadas: uma enumeração acidental do estudante ("explique a) o
 * pré b) o trans") raramente chega às quatro, enquanto a questão de prova
 * brasileira padrão sempre chega.
 */
function hasFullMultipleChoiceBlock(text: string): boolean {
  const found = new Set<string>();
  const marker = /(?:^|[\s(])([abcd])\s*[).\-–]\s+\S/g;
  let match: RegExpExecArray | null;
  while ((match = marker.exec(text)) !== null) found.add(match[1]);
  return found.size >= 4;
}

/**
 * A checagem só vale onde o assistente entregaria conteúdo educacional livre.
 * Os modos de quiz ficam FORA de propósito: ali as alternativas A/B/C/D e as
 * respostas de uma letra são o funcionamento normal da funcionalidade, e
 * aplicar a detecção quebraria o próprio quiz da disciplina.
 */
function acceptsExamRequestCheck(mode: GenerationMode | null | undefined): boolean {
  return mode === 'livre'
    || mode === 'resumo'
    || mode === 'resumo_aprofundar'
    || mode === 'info';
}

export function resolveExamAnswerRequest(
  question: string,
  mode: GenerationMode | null | undefined,
): string | null {
  if (!acceptsExamRequestCheck(mode)) return null;
  const text = normalize(question || '');
  if (text.trim().split(/\s+/).filter(Boolean).length < 3) return null;

  if (EXPLICIT_REQUEST_PATTERNS.some((pattern) => pattern.test(text))) return 'pedido_explicito';
  if (EXAM_COMMAND_PATTERNS.some((pattern) => pattern.test(text))) return 'comando_de_prova';
  if (hasFullMultipleChoiceBlock(text)) return 'multipla_escolha_colada';
  return null;
}

export function isExamAnswerRequest(
  question: string,
  mode: GenerationMode | null | undefined,
): boolean {
  return resolveExamAnswerRequest(question, mode) !== null;
}
