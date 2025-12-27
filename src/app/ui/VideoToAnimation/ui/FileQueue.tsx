import { VideoType } from "..";

export function FileQueue({ currentFile, files,isVideoPlaying }: { currentFile: number, files: VideoType[],isVideoPlaying: boolean }) {
    return <div className="mt-6 backdrop-blur-xl bg-white/5 rounded-2xl border border-white/10 p-6">
        <h4 className="text-white font-semibold mb-4 flex items-center">
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"></path>
            </svg>
            Video Queue
        </h4>
        <div className="space-y-3">
            {files.length > 0 && (
                <div className="mt-6 backdrop-blur-xl bg-white/5 rounded-2xl border border-white/10 p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {files.map((video, index) => (
                            <div
                                key={index}
                                className={`rounded-xl overflow-hidden transition-all ${video.status === 'completed'
                                        ? 'bg-green-500/10 border border-green-500/20'
                                        : video.status === 'processing'
                                            ? 'bg-blue-500/10 border border-blue-500/20'
                                            : 'bg-white/5 border border-white/10'
                                    }`}
                            >
                                <div className="relative">
                                    <div className="w-full h-32 bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center">
                                        <svg className="w-12 h-12 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"></path>
                                        </svg>
                                    </div>
                                    <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                                        {'0:00'}
                                    </div>
                                    {index === currentFile && isVideoPlaying && (
                                        <div className="absolute top-2 left-2 w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                                    )}
                                    {video.status === 'processing' && (
                                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                                            <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                        </div>
                                    )}
                                </div>
                                <div className="p-3">
                                    <div className="flex justify-between items-start mb-2">
                                        <h5 className="text-white font-medium text-sm truncate">
                                            {video.fileName}
                                        </h5>
                                        {video.status === 'completed' ? (
                                            <svg className="w-4 h-4 text-green-400 flex-shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                                            </svg>
                                        ) : video.status === 'processing' ? (
                                            <div className="w-4 h-4 bg-blue-500 rounded-full animate-pulse flex-shrink-0 ml-2"></div>
                                        ) : (
                                            <svg className="w-4 h-4 text-white/50 flex-shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                            </svg>
                                        )}
                                    </div>
                                    {video.status === 'processing' && (
                                        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full transition-all duration-300"
                                                style={{ width: `${100}%` }}
                                            ></div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    </div>
}