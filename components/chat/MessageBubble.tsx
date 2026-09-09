'use client';

// components/chat/MessageBubble.tsx — Balões com suporte a opções de menu clicáveis

import { useMemo, useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, MousePointerClick, Star } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Message } from '@/types/chat';
import { GuapuMark } from '@/components/icons/GuapuMark';

interface MessageBubbleProps {
  message: Message;
  index: number;
  sessionId?: string;
}

// ── Dispatch de seleção de opção ─────────────────────────────────────────────
function dispatchOptionClick(text: string) {
  window.dispatchEvent(new CustomEvent('suggestion-click', { detail: text }));
}

// ── Extrai texto puro de nós React (para capturar o texto dos li) ────────────
function extractText(node: ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (node && typeof node === 'object' && 'props' in node) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return extractText((node as any).props?.children);
  }
  return '';
}

export function MessageBubble({ message, index, sessionId }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const bubbleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Se for resposta do tutor, rola a tela para o INÍCIO da mensagem
    if (!isUser && bubbleRef.current) {
      setTimeout(() => {
        bubbleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    }
  }, [isUser]);

  return (
    <motion.div
      ref={bubbleRef}
      className={`guapu-chat-row ${isUser ? 'is-user' : 'is-assistant'}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.2), ease: [0.16, 1, 0.3, 1] }}
    >
      {!isUser && <GuapuMark size={28} className="guapu-message-avatar" />}

      {/* Conteúdo */}
      <div className="guapu-bubble-stack">
        {isUser ? <UserBubble content={message.content} /> : (
          <AgentBubble
            content={message.content}
            sessionId={sessionId}
            requestId={message.request_id}
            responseKind={message.response_kind}
          />
        )}

        <span className="guapu-message-time">
          {message.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </motion.div>
  );
}

// ── Balões ───────────────────────────────────────────────────────────────────

function UserBubble({ content }: { content: string }) {
  return (
    <div className="guapu-user-bubble">
      <p>{content}</p>
    </div>
  );
}

// Labels exatos que devem ser renderizados como botões interativos (menu principal)
// Qualquer outro item de lista (conteúdo, referências, exemplos) renderiza como <li> normal
const MENU_BUTTON_RE = /^(resumo de conteúdo|resumo|quiz da disciplina|quiz|simulado de prova|simulado|informações da disciplina|informações|encerrar sessão|encerrar|aprofundar|aprofundar este tema|aprofundar mais|escolher outro tema|outro tema|voltar ao menu principal|voltar ao menu|menu principal|continuar o simulado|continuar simulado|continuar o quiz|continuar quiz|fazer outra pergunta|outra pergunta|repetir a pergunta)$/i;

/**
 * Bloco de menu curto no final da resposta (v1.7.0) -> botoes (v1.8.0).
 *
 * Pedido do cliente em 09/09/2026: ao final do Resumo e de Informacoes da
 * Disciplina o menu aparecia como lista de marcadores comum dentro do balao,
 * enquanto no Quiz vinha com os botoes clicaveis. A hipotese no pedido era que
 * o Quiz recebia o menu como uma segunda mensagem, e que a aplicacao precisaria
 * passar a emitir duas mensagens. Nao e o caso: o menu do Quiz sempre esteve na
 * mesma mensagem, e virava botao porque o renderizador de <li> abaixo converte
 * itens de menu conhecidos em botoes. O que bloqueava o Resumo era a guarda
 * `responseKind === 'summary'` desse renderizador, criada quando o fim de um
 * resumo ainda era uma pergunta em prosa e qualquer lista ali era conteudo --
 * transformar bullets de conteudo em botoes seria pior.
 *
 * Em vez de afrouxar aquela guarda (que continua correta para o conteudo), o
 * menu passa a ser extraido do texto e renderizado como um grupo proprio de
 * botoes, fora do markdown. Assim vale para todas as modalidades, o conteudo
 * nunca vira botao por coincidencia, e nao e preciso uma segunda chamada ao
 * modelo nem uma segunda mensagem.
 */
const CLOSING_MENU_BLOCK = /\n*[ \t]*Menu principal:[ \t]*\n((?:[ \t]*(?:[-*\u2022])[^\n]*\n?)+)[\s]*$/;

function extractClosingMenu(text: string): { body: string; options: string[] } {
  const match = text.match(CLOSING_MENU_BLOCK);
  if (!match) return { body: text, options: [] };
  const options = match[1]
    .split('\n')
    .map((line) => line.replace(/^[ \t]*(?:[-*\u2022])[ \t]*/, '').replace(/\*\*/g, '').trim())
    .filter(Boolean);
  if (options.length === 0) return { body: text, options: [] };
  return { body: text.slice(0, match.index).trimEnd(), options };
}

function AgentBubble({ content, sessionId, requestId, responseKind }: {
  content: string;
  sessionId?: string;
  requestId?: string;
  responseKind?: Message['response_kind'];
}) {
  const { body: contentBody, options: menuOptions } = useMemo(
    () => extractClosingMenu(content),
    [content],
  );

  // Garante que opções A), B), C), D) e Referências fiquem em linhas separadas
  const formattedContent = useMemo(() => {
    let text = contentBody;

    // Alguns modelos ocasionalmente devolvem as quatro alternativas na mesma
    // linha. Quando o conjunto A-D está presente, normalizamos a apresentação
    // no cliente para que cada alternativa fique legível em sua própria linha.
    const optionLabels = [...text.matchAll(/(?:^|\s)(?:\*\*)?([A-D])\)(?:\*\*)?(?=\s)/gm)]
      .map((match) => match[1]);
    if (['A', 'B', 'C', 'D'].every((label) => optionLabels.includes(label))) {
      text = text.replace(
        /(^|\s)(?:\*\*)?([A-D])\)(?:\*\*)?(?=\s)/gm,
        (_match, _prefix: string, label: string) => `\n\n**${label})**`,
      );
    }

    if (/refer[êe]ncias:/i.test(text)) {
      text = text.replace(/(?:\*\*Refer[êe]ncias:?\*\*|Refer[êe]ncias:?)\s*(?:•|-|\*)?\s*/i, '**Referências**\n\n- ');
      text = text.replace(/(\n- [^\n]+)\s+(?:•|-|\*)\s*(Refer[êe]ncia:)/gi, '$1\n- $2');
    }
    return text;
  }, [contentBody]);

  // Componentes customizados do ReactMarkdown
  const markdownComponents = useMemo(() => ({
    // Renderiza itens de lista como botões quando são opções
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    li: ({ children, ...props }: any) => {
      const label = extractText(children).trim();
      if (!label) return <li {...props}>{children}</li>;

      // Renderiza como botão APENAS se for uma opção de menu conhecida
      // O fechamento de um resumo nunca deve criar chips, ainda que um modelo
      // ignore o formato em frase corrida. A regra vem do backend, não do texto.
      if (responseKind === 'summary' || !MENU_BUTTON_RE.test(label)) {
        return (
          <li className="guapu-list-item" {...props}>
            {children}
          </li>
        );
      }

      // Itens informativos como "Ou qualquer outra dúvida..." não viram botões
      if (label.toLowerCase().startsWith('ou ')) {
        return (
          <li className="guapu-option-note">
            {children}
          </li>
        );
      }

      return (
        <li className="list-none !pl-0 !ml-0">
          <button
            type="button"
            onClick={() => dispatchOptionClick(label)}
            className="guapu-option-button"
          >
            <MousePointerClick size={16} strokeWidth={1.8} aria-hidden="true" />
            <span>
              {children}
            </span>
            <ChevronRight size={14} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </li>
      );
    },
    // Renderiza links como texto simples — referências não devem ser links clicáveis
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    a: ({ children }: any) => (
      <span className="guapu-inline-link">{children}</span>
    ),
    // Lista ordenada e não ordenada com bullet points limpos
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ol: ({ children, ...props }: any) => {
      return <ol className="guapu-list is-ordered" {...props}>{children}</ol>;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ul: ({ children, ...props }: any) => {
      return <ul className="guapu-list" {...props}>{children}</ul>;
    },
  }), [responseKind]);

  // Política v1.1.0: estrelas somente para resposta livre, pergunta do quiz e
  // resultado de resumo. Navegação, encerramento, entradas inválidas e correções
  // não são avaliados. A decisão vem do servidor e não do texto gerado.
  const shouldShowFeedback = responseKind === 'free' || responseKind === 'quiz_question' || responseKind === 'summary';

  return (
    <div className="guapu-agent-bubble">
      <div className="guapu-markdown prose prose-sm">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {formattedContent}
        </ReactMarkdown>
      </div>

      {menuOptions.length > 0 && (
        <div className="guapu-closing-menu">
          <p className="guapu-closing-menu-title">Menu principal:</p>
          <ul className="guapu-list">
            {menuOptions.map((label) => (
              <li key={label} className="list-none !pl-0 !ml-0">
                <button
                  type="button"
                  onClick={() => dispatchOptionClick(label)}
                  className="guapu-option-button"
                >
                  <MousePointerClick size={16} strokeWidth={1.8} aria-hidden="true" />
                  <span>{label}</span>
                  <ChevronRight size={14} strokeWidth={1.8} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Componente de Avaliação Likert (1 a 5 Estrelas) — Exibido apenas em Resumos, Final de Quiz e Informações */}
      {shouldShowFeedback && <StarFeedbackRating sessionId={sessionId} requestId={requestId} />}
    </div>
  );
}

// ── Avaliação por Estrelas (Likert 1-5) ──────────────────────────────────────
function StarFeedbackRating({ sessionId, requestId }: { sessionId?: string; requestId?: string }) {
  const [rating, setRating] = useState<number | null>(null);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleRate = async (stars: number) => {
    setRating(stars);
    setSubmitted(true);
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId || 'anonymous',
          request_id: requestId,
          rating: stars,
        }),
      });
    } catch (e) {
      console.warn('Feedback submit error:', e);
    }
  };

  return (
    <div className="guapu-feedback">
      <span>
        {submitted ? 'Obrigado pela sua avaliação! ⭐' : 'Avalie a resposta:'}
      </span>
      <div>
        {[1, 2, 3, 4, 5].map((star) => {
          const active = (hoverRating || rating || 0) >= star;
          return (
            <button
              key={star}
              type="button"
              disabled={submitted}
              onClick={() => handleRate(star)}
              onMouseEnter={() => !submitted && setHoverRating(star)}
              onMouseLeave={() => !submitted && setHoverRating(null)}
              className="guapu-star-button"
              title={`${star} estrela${star > 1 ? 's' : ''} (${star === 1 ? 'ruim' : star === 5 ? 'excelente' : ''})`}
            >
              <Star size={18} strokeWidth={1.8} fill={active ? 'currentColor' : 'none'} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
