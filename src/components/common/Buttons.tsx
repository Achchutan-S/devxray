import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/utils/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-on hover:bg-accent-hover border-transparent',
  secondary: 'bg-surface text-fg border-line hover:bg-surface-raised',
  ghost: 'bg-transparent text-fg-muted border-transparent hover:bg-surface-raised hover:text-fg',
  danger: 'bg-transparent text-danger border-transparent hover:bg-danger-soft',
};

interface ToolButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: LucideIcon;
  variant?: Variant;
  children?: ReactNode;
}

export function ToolButton({
  icon: Icon,
  variant = 'secondary',
  className,
  children,
  ...rest
}: ToolButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-sm font-medium',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {Icon ? <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  /** Required: these buttons have no visible text. */
  label: string;
  variant?: Variant;
}

export function IconButton({
  icon: Icon,
  label,
  variant = 'ghost',
  className,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded border',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
