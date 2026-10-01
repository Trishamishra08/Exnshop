import { ReactNode } from 'react';

interface SummaryBarProps {
  leftIcon: ReactNode;
  leftLabel: string;
  leftValue: string;
  rightIcon: ReactNode;
  rightLabel: string;
  rightValue: string;
  accentColor: string;
}

export default function SummaryBar({
  leftIcon,
  leftLabel,
  leftValue,
  rightIcon,
  rightLabel,
  rightValue,
  accentColor,
}: SummaryBarProps) {
  return (
    <div className="bg-white rounded-[14px] p-3.5 shadow-sm flex items-center justify-between border border-neutral-100 hover:shadow-md transition-shadow">
      {/* Left Section */}
      <div className="flex items-center gap-2.5 flex-1">
        <div className="scale-90" style={{ color: accentColor }}>
          {leftIcon}
        </div>
        <div className="flex flex-col">
          <span className="text-neutral-600 text-[11px] leading-tight font-medium">{leftLabel}</span>
          <span className="text-neutral-900 text-[15px] font-bold mt-0.5">{leftValue}</span>
        </div>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-2.5 flex-1 justify-end">
        <div className="scale-90" style={{ color: accentColor }}>
          {rightIcon}
        </div>
        <div className="flex flex-col items-end">
          <span className="text-neutral-600 text-[11px] leading-tight font-medium">{rightLabel}</span>
          <span className="text-neutral-900 text-[15px] font-bold mt-0.5">{rightValue}</span>
        </div>
      </div>
    </div>
  );
}




