"use client"

import { useState } from "react"
import CTAButton from "./CTAButton"
import PulsingText from "./PulsingText"
import { VideoToAnimationUi } from "./VideoToAnimation"

export function TabsUI() {
    const [selectedTabUi, setSelectedTabUi] = useState("VideoToAnimation")
    return <div>
        <div className="flex justify-center">
            <h1 className="text-4xl">{selectedTabUi}</h1>
        </div>
        <div className="flex gap-x-1.5 justify-center">
            <CTAButton>
                Video To Animation
            </CTAButton>
            <CTAButton disabled>
                Text To Animation
            </CTAButton>
            <CTAButton disabled>
                Text To Pose
            </CTAButton>
        </div>
        <div className="flex my-2 justify-center">
            <VideoToAnimationUi />
        </div>
    </div>
}