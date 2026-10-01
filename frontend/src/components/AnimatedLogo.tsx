import React from 'react';
import { motion } from 'framer-motion';

interface AnimatedLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function AnimatedLogo({
  className = '',
  size = 'md',
}: AnimatedLogoProps) {
  const sizeMap = {
    sm: 'w-24 max-h-10',
    md: 'w-32 sm:w-36 max-h-14',
    lg: 'w-40 sm:w-44 max-h-16',
  };

  const currentSize = sizeMap[size] || sizeMap.md;

  return (
    <div className={`relative flex items-center justify-center select-none ${className}`}>
      {/* Smooth entrance animation (swap / slide down + scale bounce) */}
      <motion.div
        initial={{ opacity: 0, y: -24, scale: 0.8 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{
          type: 'spring',
          stiffness: 280,
          damping: 18,
          duration: 0.5,
        }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.96 }}
        className="flex items-center justify-center"
      >
        <img
          src="/exnshop_logo.png"
          alt="Exnshop Logo"
          className={`${currentSize} h-auto object-contain mx-auto drop-shadow-sm`}
        />
      </motion.div>
    </div>
  );
}
