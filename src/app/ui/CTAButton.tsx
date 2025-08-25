"use client"
import Link from 'next/link'
import { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Lock } from 'lucide-react'

export default function CTAButton({
  children,
  className = '',
  href,
  asButton = true,
  onClick,
  disabled = false
}: {
  children: ReactNode;
  className?: string;
  href?: string;
  asButton?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  // Анимация замочка
  const lockAnimation = {
    initial: { rotate: 0, scale: 1 },
    animate: { 
      rotate: [0, -10, 10, -10, 10, 0],
      scale: [1, 1.1, 1, 1.1, 1],
      transition: { 
        duration: 0.6,
        repeat: Infinity,
        repeatType: "reverse" as const
      }
    }
  }

  if (href && !asButton) {
    return (
      <Link 
        href={disabled ? "#" : href} 
        className={`px-8 py-3 bg-white/20 backdrop-blur-sm border border-white/30 
                   rounded-lg text-white font-medium hover:bg-white/30 transition-all
                   ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
                   ${className}`}
        aria-disabled={disabled}
      >
        <div className="flex items-center justify-center gap-2">
          {children}
          {disabled && (
            <motion.div 
              variants={lockAnimation}
              initial="initial"
              animate="animate"
            >
              <Lock size={16} className="text-white" />
            </motion.div>
          )}
        </div>
      </Link>
    )
  }

  return (
    <button 
      onClick={onClick} 
      disabled={disabled}
      className={`px-8 py-3 shadow-md backdrop-blur-xl bg-white/5 rounded-xl border border-white/10 
                 text-white font-medium transition-all
                 ${disabled ? 'opacity-50 cursor-not-allowed hover:bg-white/5' : 'hover:bg-white/30 cursor-pointer'}
                 ${className}`}
    >
      <div className="flex items-center justify-center gap-2">
        {children}
        {disabled && (
          <motion.div 
            variants={lockAnimation}
            initial="initial"
            animate="animate"
          >
            <Lock size={16} className="text-white" />
          </motion.div>
        )}
      </div>
    </button>
  )
}