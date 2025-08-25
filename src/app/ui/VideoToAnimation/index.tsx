"use client"
import { useEffect, useRef, useState } from "react";
import { FileQueue } from "./ui/FileQueue";
import { FilesetResolver, HolisticLandmarker } from "@mediapipe/tasks-vision";
import dynamic from 'next/dynamic'
import { LoadAssetContainerAsync, Mesh, Scene } from "@babylonjs/core";
import { MmdStandardMaterialBuilder, MmdWasmRuntime } from "babylon-mmd";
import { MotionModel } from "./logic/MotionModel";
import { formatTime } from "./ui/Functions";
import { VideoPlayer } from "./ui/VideoPlayer";
import { ExportAnimation } from "./logic/ExportAnimation";
import { AnimatePresence, motion } from "framer-motion";
import { Bug, Download, Github, X } from "lucide-react";

export type VideoType = {
    fileName: string
    fileUrl: string,
    progress: number
    status: "pending" | 'processing' | 'completed'
    duration: string
}
export function VideoToAnimationUi() {
    const [processedFiles, setProcessedFiles] = useState<Set<string>>(new Set())
    const [videos, setVideos] = useState<VideoType[]>([])

    const [currentFile, setCurrentFile] = useState(0);
    const [currentStep, setCurrentStep] = useState(0);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);

    const [isComplete, setIsComplete] = useState(false)
    const [isProcessing, setIsProcessing] = useState(false);
    const [VideoPlaying, setIsVideoPlaying] = useState(false)

    const videoUploadRef = useRef<HTMLInputElement>(null)
    const videoRef = useRef<HTMLVideoElement>(null)
    const animationRef = useRef<number>(null);
    const HolisticRef = useRef<HolisticLandmarker>(null)
    const motionModelRef = useRef<MotionModel>(new MotionModel())
    const closeModal = () => {
        setIsComplete(false)
        setVideos([])
        motionModelRef.current.keyframes = [];
        
    }
    const handleFileUpload = (event: any) => {
        const files = Array.from(event.target.files);
        const newVideos: VideoType[] = files.map((file: any, index) => ({
            fileName: file.name,
            progress: 0,
            fileUrl: URL.createObjectURL(file),
            duration: '0:00',
            status: 'pending'
        }));
        setVideos(prev => [...prev, ...newVideos]);
    };

    const startProcessing = () => {
        if (videos.length > 0 && videos.some(video => video.status === 'pending')) {
            setIsProcessing(true);
            setIsComplete(false);
            setCurrentStep(0);
            setVideos(prev => prev.map((video, index) =>
                index === 0 ? { ...video, status: 'processing', progress: 0 } : video
            ));

            // Start playing first video
            setTimeout(() => {
                if (videoRef.current) {
                    videoRef.current.muted = true;
                    videoRef.current.play().catch(e => console.log('Autoplay blocked:', e));
                    setIsVideoPlaying(true);
                }
            }, 500);
        }
    };
    const handleSeek = (e: any) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        const newTime = pos * duration;
        if (videoRef.current) {
            videoRef.current.currentTime = newTime;
            setCurrentTime(newTime);
        }
    };
    const handleTimeUpdate = () => {
        if (videoRef.current) {
            setCurrentTime(videoRef.current.currentTime);
        }
    };

    const handleLoadedMetadata = () => {
        if (videoRef.current) {
            setDuration(videoRef.current.duration);
            // Update duration in videos array
            setVideos(prev => prev.map((video, index) =>
                index === currentFile
                    ? { ...video, duration: formatTime(videoRef.current!.duration) }
                    : video
            ));
        }
    };
    const handleVideoEnd = () => {
        setIsVideoPlaying(false);

        if (currentStep < videos.length - 1) {
            // Move to next video
            const nextIndex = currentStep + 1;
            setCurrentStep(nextIndex);

            // Update video status
            setVideos(prev => prev.map((video, index) =>
                index === currentStep
                    ? { ...video, status: 'completed', progress: 100 }
                    : index === nextIndex
                        ? { ...video, status: 'processing', progress: 0 }
                        : video
            ));

            // Play next video
            setTimeout(() => {
                if (videoRef.current) {
                    videoRef.current.load();
                    videoRef.current.muted = true;
                    videoRef.current.play().catch(e => console.log('Autoplay blocked:', e));
                    setIsVideoPlaying(true);
                }
            }, 500);
        } else {
            // Last video completed
            setVideos(prev => prev.map((video, index) =>
                index === currentStep
                    ? { ...video, status: 'completed', progress: 100 }
                    : video
            ));
            setIsComplete(true);
            setIsProcessing(false);
        }
    };
    const loadModel = async (
        modelScene: Scene,
        mmdRuntime: MmdWasmRuntime,
        materialBuilder: MmdStandardMaterialBuilder
    ) => {
        await LoadAssetContainerAsync(
            "/model/绮良良.bpmx",
            modelScene, {
            pluginOptions: {
                mmdmodel: {
                    materialBuilder: materialBuilder,
                    boundingBoxMargin: 60,
                    loggingEnabled: true
                }
            }
        }
        ).then(async res => {
            const mesh = res.meshes[0]
            for (const m of mesh.metadata.meshes) {
                m.receiveShadows = true
            }
            res.addAllToScene()
            motionModelRef.current.init(mmdRuntime.createMmdModel(mesh as Mesh, {
                buildPhysics: {
                    disableOffsetForConstraintFrame: true,
                },
            }))
        })
    };
    const loadHolistic = async () => {
        try {
            FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.15/wasm").then(
                async (vision) => {
                    HolisticRef.current = await HolisticLandmarker.createFromOptions(vision, {
                        baseOptions: {
                            modelAssetPath:
                                "https://storage.googleapis.com/mediapipe-models/holistic_landmarker/holistic_landmarker/float16/latest/holistic_landmarker.task",
                            delegate: "GPU",
                        },
                        runningMode: "VIDEO",
                    })

                })

        } catch (err) {
            console.log(err)
        }

    }
    useEffect(() => {
        loadHolistic().then(() => {
            console.log("Holistic loaded")
        })
    }, [])

    useEffect(() => {
        if (!isProcessing || isComplete) return;

        const processVideo = () => {
            setVideos(prevVideos => {
                const updatedVideos = [...prevVideos];
                const currentVideo = updatedVideos[currentStep];

                if (!currentVideo || currentVideo.status !== 'processing') return prevVideos;
                const newProgress = Math.min(currentVideo.progress + 0.5, 100);
                updatedVideos[currentStep] = { ...currentVideo, progress: newProgress };

                return updatedVideos;
            });
            if (!videoRef.current!.paused && videoRef.current!.readyState >= 2) {
                var timestamp = performance.now()
                HolisticRef.current?.detectForVideo(videoRef.current!, timestamp, (result) => {
                    motionModelRef.current.motionCalculate(result, currentStep)
                })
            }

            if (!isComplete && isProcessing) {
                animationRef.current = requestAnimationFrame(processVideo);
            }
        };

        animationRef.current = requestAnimationFrame(processVideo);

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [isProcessing, isComplete, currentStep, videos.length]);

    return (
        <div className="container mx-auto">
            <div className="backdrop-blur-xl bg-white/10 rounded-2xl border border-white/20 shadow-2xl overflow-hidden">

                <div className="bg-black/20 p-6 border-b border-white/10">
                    <h1 className="text-2xl font-bold text-white text-center">
                        {isComplete ? 'Processing Complete!' : isProcessing ? 'Auto Processing Videos to MMD animation' : 'Video Auto Processor to MMD animation'}
                    </h1>
                    <p className="text-white/70 text-center mt-2">
                        {isComplete
                            ? 'All videos have been processed successfully'
                            : isProcessing
                                ? 'Videos are playing and processing automatically'
                                : 'Upload videos for automatic processing to animation'
                        }
                    </p>
                </div>
                <div className="p-6">
                    <div className="mb-6 flex justify-center flex-wrap">
                        <input
                            ref={videoUploadRef}
                            type="file"
                            accept="video/*"
                            multiple
                            onChange={handleFileUpload}
                            className="hidden"
                        />
                        <button
                            onClick={() => videoUploadRef.current!.click()}
                            className="px-8 cursor-pointer py-4 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 rounded-xl text-white font-bold text-lg transition-all duration-300 hover:scale-105 shadow-lg mr-4"
                        >
                            Select Videos
                        </button>

                        {videos.length > 0 && (
                            <button
                                onClick={startProcessing}
                                className="px-8 cursor-pointer py-4 bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-600 hover:to-teal-600 rounded-xl text-white font-bold text-lg transition-all duration-300 hover:scale-105 shadow-lg"
                            >
                                Start
                            </button>
                        )}

                    </div>

                    {videos.length != 0 && <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <VideoPlayer
                            videoRef={videoRef}
                            videos={videos}
                            currentTime={currentTime}
                            currentVideoIndex={currentStep}
                            duration={duration}
                            handleSeek={handleSeek}
                            handleLoadedMetadata={handleLoadedMetadata}
                            handleTimeUpdate={handleTimeUpdate}
                            handleVideoEnd={handleVideoEnd}
                        />
                        <div className="space-y-6">
                            {/* Current Video Progress */}
                            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                                <div className="flex justify-between items-center mb-3">
                                    <h4 className="text-white font-semibold">Current Video Processing</h4>
                                    <span className="text-white/70 text-sm">
                                        {currentStep + 1}/{videos.length}
                                    </span>
                                </div>
                                {videos[currentStep] && (
                                    <>
                                        <p className="text-white/80 mb-4">

                                        </p>
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-sm text-white/70">
                                                <span className="truncate">{videos[currentStep]?.fileName}</span>
                                                <span>{Math.round(videos[currentStep]?.progress || 0)}%</span>
                                            </div>
                                            <div className="h-3 bg-white/10 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full transition-all duration-300"
                                                    style={{
                                                        width: `${videos[currentStep]?.progress || 0}%`
                                                    }}
                                                ></div>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>}
                </div>
            </div>
            <AnimatePresence>
                {isComplete && (
                    <motion.div
                        className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={closeModal}
                    >
                        <motion.div
                            className="bg-gray-800 rounded-2xl p-8 max-w-md w-full shadow-2xl"
                            initial={{ scale: 0.7, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.7, opacity: 0 }}
                            transition={{ type: "spring", damping: 25 }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-2xl font-bold text-white">Animation Ready!</h2>
                                <motion.button
                                    onClick={closeModal}
                                    className="text-gray-400 hover:text-white transition-colors"
                                    whileHover={{ rotate: 90 }}
                                    whileTap={{ scale: 0.9 }}
                                >
                                    <X size={24} />
                                </motion.button>
                            </div>

                            <p className="text-gray-300 mb-6">
                                Your animation has been successfully generated. Before downloading,
                                help us grow by supporting the project!
                            </p>

                            <div className="space-y-4 mb-8">
                                <motion.a
                                    href="https://github.com"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-4 p-4 bg-gray-700 hover:bg-gray-600 rounded-xl transition-colors"
                                    whileHover={{ x: 5 }}
                                    whileTap={{ scale: 0.98 }}
                                >
                                    <div className="bg-gray-600 p-3 rounded-lg">
                                        <Github size={24} className="text-white" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-white">Star on GitHub</h3>
                                        <p className="text-gray-400 text-sm">Show your support</p>
                                    </div>
                                </motion.a>

                                <motion.a
                                    href="https://t.me"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-4 p-4 bg-gray-700 hover:bg-gray-600 rounded-xl transition-colors"
                                    whileHover={{ x: 5 }}
                                    whileTap={{ scale: 0.98 }}
                                >
                                    <div className="bg-blue-500 p-3 rounded-lg">
                                        <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M12 0c-6.627 0-12 5.373-12 12s5.373 12 12 12 12-5.373 12-12-5.373-12-12-12zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.14.141-.259.259-.374.261l.213-3.053 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.136-.954l11.566-4.458c.538-.196 1.006.128.832.941z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-white">Join Telegram</h3>
                                        <p className="text-gray-400 text-sm">Get updates & support</p>
                                    </div>
                                </motion.a>

                                <motion.a
                                    href="https://github.com/issues"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-4 p-4 bg-gray-700 hover:bg-gray-600 rounded-xl transition-colors"
                                    whileHover={{ x: 5 }}
                                    whileTap={{ scale: 0.98 }}
                                >
                                    <div className="bg-red-500 p-3 rounded-lg">
                                        <Bug size={24} className="text-white" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-white">Report a Bug</h3>
                                        <p className="text-gray-400 text-sm">Help improve the tool</p>
                                    </div>
                                </motion.a>
                            </div>

                            <motion.button
                                onClick={() => {
                                    console.log(motionModelRef.current.keyframes)
                                    motionModelRef.current.keyframes.forEach((motion, index) => {
                                        const vmdBlob = ExportAnimation.exportToVMD(motionModelRef.current._Model!, motion.keyFrames);
                                        const url = URL.createObjectURL(vmdBlob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = `akira_animation${index}.vmd`;
                                        document.body.appendChild(a);
                                        a.click();
                                        document.body.removeChild(a);
                                        URL.revokeObjectURL(url);
                                    })
                                }}
                                className="w-full cursor-pointer py-4 bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-600 hover:to-teal-600 rounded-xl text-white font-bold text-lg transition-all duration-300 flex items-center justify-center gap-3"
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                            >
                                <Download size={24} />
                                Download Animations
                            </motion.button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
            <MMDDynamicScene loadModel={loadModel} />
            {videos.length != 0 && <FileQueue currentFile={currentFile} isVideoPlaying={VideoPlaying} files={videos} />}
        </div>
    )
}

const MMDDynamicScene = dynamic(
    () => import("./ui/MMDScene"),
    {
        ssr: false,
        loading: () => <div></div>
    }
)
