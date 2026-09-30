import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

export interface DashboardCardProps {
  icon: ReactNode;
  title: string;
  value: number | string;
  accentColor: string;
  subtitle?: string;
  compact?: boolean;
  to?: string;
  onClick?: () => void;
  ariaLabel?: string;
}

export default function DashboardCard({
  icon,
  title,
  value,
  accentColor,
  subtitle,
  compact = false,
  to,
  onClick,
  ariaLabel,
}: DashboardCardProps) {
  const navigate = useNavigate();
  const isClickable = Boolean(to || onClick);

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else if (to) {
      navigate(to);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isClickable) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <div
      onClick={isClickable ? handleClick : undefined}
      onKeyDown={isClickable ? handleKeyDown : undefined}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      aria-label={ariaLabel || (isClickable ? `View ${title}: ${value}` : undefined)}
      className={`bg-white rounded-lg shadow-sm border border-neutral-200 ${compact ? 'p-2.5 sm:p-3' : 'p-3 sm:p-4 md:p-5'} ${
        isClickable
          ? 'cursor-pointer hover:shadow-md hover:border-neutral-300 hover:-translate-y-0.5 active:translate-y-0 active:shadow-xs transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-teal-500 select-none'
          : ''
      }`}
    >
      <div className={`flex items-start justify-between ${compact ? 'mb-1.5' : 'mb-2 sm:mb-3'}`}>
        <div className={`${compact ? 'p-1.5' : 'p-2 sm:p-3'} rounded-lg`} style={{ backgroundColor: `${accentColor}20` }}>
          <div style={{ color: accentColor }} className={compact ? 'w-4 h-4 sm:w-5 sm:h-5' : 'w-6 h-6 sm:w-8 sm:h-8'}>
            {icon}
          </div>
        </div>
      </div>
      <h3 className={`text-neutral-600 font-medium mb-1 ${compact ? 'text-[11px] sm:text-xs' : 'text-xs sm:text-sm'}`}>{title}</h3>
      <p className={`font-bold text-neutral-900 ${compact ? 'text-base sm:text-lg' : 'text-xl sm:text-2xl'}`}>{value}</p>
      {subtitle && <p className="text-[11px] text-neutral-400 mt-0.5">{subtitle}</p>}
    </div>
  );
}


