import { ReactNode } from 'react';

interface DashboardCardProps {
  icon: ReactNode;
  title: string;
  value: string | number;
  accentColor: string;
  onClick?: () => void;
}

export default function DashboardCard({ icon, title, value, accentColor, onClick }: DashboardCardProps) {
  return (
    <div 
      onClick={onClick}
      className={`bg-white rounded-[14px] p-3 shadow-sm flex flex-col items-center justify-center border border-neutral-100 hover:shadow-md transition-shadow ${onClick ? 'cursor-pointer' : ''}`}
    >
      <div className="mb-2 scale-90" style={{ color: accentColor }}>
        {icon}
      </div>
      <p className="text-neutral-600 text-[11px] leading-tight font-medium text-center mb-1.5">{title}</p>
      <p className="text-neutral-900 text-xl font-bold">{value}</p>
    </div>
  );
}




