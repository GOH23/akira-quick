"use client"

import React from 'react'
import { useLocale } from '../../i18n/LocaleProvider'
import LINKS from '../../config/links'
import { Github, Send } from 'lucide-react'

export default function Header() {
  const { locale, setLocale } = useLocale()

  return (
    <header className="w-full flex items-center justify-between px-6 py-3 bg-black/20 border-b border-white/5">
      <div className="flex items-center gap-4">
        <div className="text-lg font-bold">Akira Quick</div>
      </div>

      <div className="flex items-center gap-4">
        <nav className="flex items-center gap-3">
          <a href={LINKS.github} target="_blank" rel="noreferrer" className="text-white/80 hover:text-white flex items-center gap-2">
            <Github size={16} />
            <span className="hidden sm:inline">GitHub</span>
          </a>
          <a href={LINKS.telegram} target="_blank" rel="noreferrer" className="text-white/80 hover:text-white flex items-center gap-2">
            <Send size={16} />
            <span className="hidden sm:inline">Telegram</span>
          </a>
          <a href={LINKS.issues} target="_blank" rel="noreferrer" className="text-white/80 hover:text-white flex items-center gap-2">
            <span className="hidden sm:inline">Issues</span>
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <label className="text-sm text-white/80">{locale.toUpperCase()}</label>
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as any)}
            className="bg-transparent border border-white/10 text-white/90 rounded px-2 py-1"
          >
            <option value="en">EN</option>
            <option value="ru">RU</option>
          </select>
        </div>
      </div>
    </header>
  )
}
