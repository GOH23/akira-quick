"use client"
import { motion } from 'framer-motion'
import { Github, Mail, MessageCircle, Star, Bug } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { FaTelegram } from "react-icons/fa";
export default function SocialLinks() {
    const [hoveredSocial, setHoveredSocial] = useState<string | null>(null)

    const socialLinks = [
        {
            name: 'Telegram',
            url: 'https://t.me/yourusername',
            icon: FaTelegram,
            highlight: true
        },
        {
            name: 'Start Repository',
            url: 'https://github.com/yourusername/your-repo',
            icon: Star,
            highlight: true
        },
        {
            name: 'Send Bugs',
            url: 'mailto:your@email.com?subject=Bug Report',
            icon: Bug,
            highlight: true
        },
        {
            name: 'GitHub',
            url: 'https://github.com/yourusername',
            icon: Github
        },
    ]

    return (
        <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="fixed top-6 right-6 z-50 flex flex-col items-end gap-4"
        >
            {/* Название Akira Quick - всегда видно */}
            <div className="text-white font-bold text-lg bg-gradient-to-r from-blue-500 to-purple-600 
                    px-4 py-2 rounded-xl shadow-lg">
                Akira Quick
            </div>

            {/* Социальные иконки */}
            <div className="flex flex-col gap-3">
                {socialLinks.map((social, index) => {
                    const Icon = social.icon
                    return (
                        <motion.div
                            key={social.name}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.1 * index + 0.3, duration: 0.3 }}
                            whileHover={{ scale: 1.1, rotate: social.highlight ? [0, -5, 5, 0] : 0 }}
                            whileTap={{ scale: 0.95 }}
                            className="group relative"
                            onMouseEnter={() => setHoveredSocial(social.name)}
                            onMouseLeave={() => setHoveredSocial(null)}
                        >
                            <Link
                                href={social.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`
                  block p-3 rounded-xl border transition-all duration-300 relative
                  ${social.highlight
                                        ? social.name === 'Start Repository'
                                            ? 'bg-gradient-to-br from-yellow-500 to-orange-500 text-white border-yellow-400 shadow-lg shadow-yellow-500/25'
                                            : social.name === 'Send Bugs'
                                                ? 'bg-gradient-to-br from-red-500 to-pink-500 text-white border-red-400 shadow-lg shadow-red-500/25'
                                                : 'bg-gradient-to-br from-blue-500 to-blue-600 text-white border-blue-400 shadow-lg shadow-blue-500/25'
                                        : 'bg-black/20 backdrop-blur-sm text-white/80 border-white/10 hover:text-white hover:bg-white/10'
                                    }
                  hover:shadow-lg
                `}
                                aria-label={social.name}
                            >
                                <Icon size={20} />

                                {/* Выплывающее название при наведении */}
                                {hoveredSocial === social.name && (
                                    <motion.div
                                        initial={{ opacity: 0, x: 10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 10 }}
                                        transition={{ duration: 0.2 }}
                                        className="absolute right-full mr-2 top-1/2 -translate-y-1/2 
                              bg-black/80 backdrop-blur-sm text-white text-sm px-2 py-1 rounded-lg 
                              whitespace-nowrap shadow-lg"
                                    >
                                        {social.name}
                                    </motion.div>
                                )}

                                {/* Индикаторы для выделенных кнопок */}
                                {social.highlight && social.name !== 'Telegram' && (
                                    <motion.span
                                        className="absolute -top-1 -right-1 w-3 h-3 bg-white/30 rounded-full"
                                        animate={{
                                            scale: [1, 1.2, 1],
                                            opacity: [0.5, 1, 0.5]
                                        }}
                                        transition={{
                                            duration: 1.5,
                                            repeat: Infinity
                                        }}
                                    />
                                )}
                            </Link>
                        </motion.div>
                    )
                })}
            </div>
        </motion.div>
    )
}