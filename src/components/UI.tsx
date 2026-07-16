import type { ReactNode } from 'react';
import { Info, CheckCircle2, Circle } from 'lucide-react';
import { complianceNote } from '../config';

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description?: string; actions?: ReactNode }) {
  return <div className="page-heading">
    <div>
      <div className="eyebrow">{eyebrow}</div>
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </div>
    {actions && <div className="heading-actions">{actions}</div>}
  </div>;
}

export function DemoNote({ text = complianceNote }: { text?: string }) {
  return <span className="demo-note"><Info />{text}</span>;
}

export function Surface({ title, kicker, children, className = '' }: { title?: string; kicker?: string; children: ReactNode; className?: string }) {
  return <section className={`surface ${className}`}>
    {(title || kicker) && <div className="surface-header"><div>{title && <div className="surface-title">{title}</div>}{kicker && <div className="surface-kicker">{kicker}</div>}</div></div>}
    <div className="surface-body">{children}</div>
  </section>;
}

export function StatusDot({ active = true }: { active?: boolean }) {
  return active ? <CheckCircle2 size={14} color="#6ed9b3" /> : <Circle size={14} color="#536581" />;
}
