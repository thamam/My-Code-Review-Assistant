import React from 'react';
import Prism from 'prismjs';

export function getLanguage(path: string): string {
  if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'javascript';
  if (path.endsWith('.js') || path.endsWith('.jsx')) return 'javascript';
  if (path.endsWith('.py')) return 'python';
  if (path.endsWith('.css')) return 'css';
  if (path.endsWith('.html')) return 'html';
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.md')) return 'markdown';
  return 'clike';
}

export const renderToken = (token: string | Prism.Token, key: number): React.ReactNode => {
  if (typeof token === 'string') return token;

  const className = `token ${token.type} ${token.alias || ''}`;
  const content = Array.isArray(token.content)
    ? token.content.map((t, i) => renderToken(t, i))
    : token.content.toString();

  return (
    <span key={key} className={className}>
      {content}
    </span>
  );
};

export const HighlightedText: React.FC<{ text: string; language: string }> = React.memo(
  ({ text, language }) => {
    if (text.length > 1000) return <>{text}</>;

    try {
      const grammar = Prism.languages[language] || Prism.languages.clike;
      if (!grammar) return <>{text}</>;

      const tokens = Prism.tokenize(text, grammar);
      return <>{tokens.map((token, i) => renderToken(token, i))}</>;
    } catch {
      return <>{text}</>;
    }
  }
);
