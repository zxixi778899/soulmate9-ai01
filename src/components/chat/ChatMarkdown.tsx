'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatMarkdownProps {
  content: string;
  className?: string;
}

/**
 * Renders chat message content with Markdown support.
 * Supports: bold, italic, links, code blocks, lists, strikethrough.
 * Falls back to plain text for messages without markdown syntax.
 */
export function ChatMarkdown({ content, className = '' }: ChatMarkdownProps) {
  let text = '';
  try {
    text = typeof content === 'string' ? content : content == null ? '' : String(content);
  } catch {
    return null;
  }
  if (!text) return null;

  // Fast check: if no markdown syntax, render as plain text
  const hasMarkdown = /[*_~`#\[\]|]/.test(text);

  if (!hasMarkdown) {
    return <span className={className || undefined}>{text}</span>;
  }

  try {
  return (
    <div className={`chat-markdown ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
        // Links open in new tab with safety attrs
        a: ({ href, children, ...props }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#FF6BA6] underline underline-offset-2 hover:text-[#FF2D78] transition-colors"
            {...props}
          >
            {children}
          </a>
        ),
        // Code blocks with dark styling
        code: ({ className: codeClassName, children, ...props }) => {
          const isInline = !codeClassName?.includes('language-');
          if (isInline) {
            return (
              <code
                className="px-1.5 py-0.5 rounded bg-white/[0.08] text-[#FF6BA6] text-[0.85em] font-mono"
                {...props}
              >
                {children}
              </code>
            );
          }
          return (
            <code
              className={`block p-3 rounded-lg bg-black/40 border border-white/[0.06] text-sm font-mono overflow-x-auto ${codeClassName || ''}`}
              {...props}
            >
              {children}
            </code>
          );
        },
        // Paragraphs with proper spacing
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        // Lists
        ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
        // Blockquotes
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-[#FF2D78]/40 pl-3 italic text-white/60 my-2">
            {children}
          </blockquote>
        ),
        // Strong (bold)
        strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
        // Emphasis (italic)
        em: ({ children }) => <em className="italic">{children}</em>,
      }}
    >
      {text}
    </ReactMarkdown>
    </div>
  );
  } catch {
    return <span className={className || undefined}>{text}</span>;
  }
}
