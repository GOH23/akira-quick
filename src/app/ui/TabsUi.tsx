"use client"
import React, { useState, useMemo, useCallback } from "react"
import CTAButton from "./CTAButton"
import { useTranslation } from "../../i18n/LocaleProvider"
import { VideoToAnimationUi } from "./VideoToAnimation"
import { AnimatePresence, motion } from "framer-motion"
import { TextToPose } from "./TextToPose"
type TabKey = "video" | "textAnim" | "textPose"

const TABS: {
    key: TabKey
    labelKey: string
    disabled?: boolean
    Component?: React.ComponentType
}[] = [
        { key: "video", labelKey: "tabs.videoToAnimation", disabled: false, Component: VideoToAnimationUi },
        { key: "textAnim", labelKey: "tabs.textToAnimation", disabled: true },
        { key: "textPose", labelKey: "tabs.textToPose", disabled: false, Component: TextToPose },
    ]

export function TabsUI(): React.ReactElement {
    const [selectedTab, setSelectedTab] = useState<TabKey>("video")
    const handleSelect = useCallback((key: TabKey) => () => setSelectedTab(key), [])
    const activeTab = useMemo(() => TABS.find(t => t.key === selectedTab) ?? TABS[0], [selectedTab])
    const fadeVariants = useMemo(() => ({ initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }), [])
    const ActiveComponent = activeTab.Component ?? null
    return (
        <div>
            <div className="flex justify-center">
                {(() => {
                    const tr = useTranslation()
                    return <h1 className="text-4xl">{tr(activeTab.labelKey)}</h1>
                })()}
            </div>

            <div className="flex flex-wrap gap-1.5 justify-center" role="tablist" aria-label="Main tabs">
                {TABS.map(tab => (
                    <CTAButton
                        key={tab.key}
                        onClick={handleSelect(tab.key)}
                        disabled={!!tab.disabled}
                        className={tab.key === selectedTab ? "ring-2 ring-white/20" : ""}
                    >
                        {(() => {
                            const tr = useTranslation()
                            return (
                                <span className="inline-flex items-center gap-1">
                                    {tr(tab.labelKey)}
                                    {tab.key === "textPose" && (
                                        <span className="text-xs font-semibold text-purple-300 bg-purple-900/40 px-2 py-0.5 rounded align-middle ml-1">Beta</span>
                                    )}
                                </span>
                            )
                        })()}
                    </CTAButton>
                ))}
            </div>
            <div className="flex my-2 mx-auto justify-center">
                <AnimatePresence mode="wait">
                    <motion.div
                        className="container mx-auto"
                        key={selectedTab}
                        variants={fadeVariants}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                    >
                        {ActiveComponent ? <ActiveComponent /> : <div />}
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    )
}