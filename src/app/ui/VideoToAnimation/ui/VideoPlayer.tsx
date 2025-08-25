import { Ref } from "react";
import { VideoType } from "..";
import { formatTime } from "./Functions";

export function VideoPlayer({
    videos,
    currentVideoIndex,
    videoRef,
    handleSeek,
    currentTime,
    duration,
    handleLoadedMetadata,
    handleTimeUpdate,
    handleVideoEnd
}: {
    videos: VideoType[],
    currentVideoIndex: number,
    videoRef: Ref<HTMLVideoElement>
    handleSeek: (e: any) => void
    currentTime: number
    duration: number,
    handleLoadedMetadata: () => void,
    handleTimeUpdate: () => void
    handleVideoEnd: ()=>void
}) {
    return <div className="space-y-4">
        <div className="relative bg-black rounded-xl overflow-hidden">
            {videos[currentVideoIndex] && (
                <video
                    ref={videoRef}
                    src={videos[currentVideoIndex]?.fileUrl}
                    className="w-full min-w-full h-64 object-contain"
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={handleLoadedMetadata}
                    onEnded={handleVideoEnd}
                    muted
                />
            )}
            <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                No Sound
            </div>
        </div>

        {/* Video Controls */}
        {videos[currentVideoIndex] && (
            <div className="space-y-3">
                <div
                    className="w-full h-2 bg-white/20 rounded-full cursor-pointer"
                    onClick={handleSeek}
                >
                    <div
                        className="h-full bg-blue-500 rounded-full"
                        style={{ width: `${(currentTime / duration) * 100 || 0}%` }}
                    ></div>
                </div>
                <div className="flex justify-between items-center text-white/70 text-sm">
                    <span>{formatTime(currentTime)}</span>
                    <span>{videos[currentVideoIndex]?.duration || '0:00'}</span>
                </div>
                <div className="flex items-center justify-between">
                    <h3 className="text-white font-semibold truncate mr-2">
                        {videos[currentVideoIndex]?.fileName}
                    </h3>
                    <div className="flex items-center space-x-2">
                        <span className="text-white/70 text-sm">
                            {currentVideoIndex + 1}/{videos.length}
                        </span>
                    </div>
                </div>
            </div>
        )}
    </div>
}