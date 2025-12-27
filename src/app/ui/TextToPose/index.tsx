"use client"

import * as webllm from "@mlc-ai/web-llm";
import { useEffect, useState, useRef, useMemo } from "react";
// Load markdown-it dynamically to avoid bundler resolution issues in the dev server
import { useTranslation } from '../../../i18n/LocaleProvider'

export function TextToPose() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const chatRef = useRef<webllm.MLCEngine>(null);
    const [modelReady, setModelReady] = useState(false);
    const [streamingText, setStreamingText] = useState<string>("");
    const [isStreaming, setIsStreaming] = useState(false);
    const [thinkVisible, setThinkVisible] = useState(true);
    const translate = useTranslation();
    const [md, setMd] = useState<any>(null);

    // Dynamically import markdown-it on the client to avoid module resolution errors
    useEffect(() => {
        let mounted = true;
        import('markdown-it')
            .then((mod) => {
                if (!mounted) return;
                const MarkdownIt = mod && (mod.default ?? mod);
                setMd(new MarkdownIt({ html: true }));
            })
            .catch((err) => {
                console.warn('Failed to load markdown-it dynamically:', err);
            });
        return () => { mounted = false; };
    }, []);

    // Advanced model settings
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [temperature, setTemperature] = useState(1);
    const [contextWindow, setContextWindow] = useState(30096);
    const [systemPrompt, setSystemPrompt] = useState(`You are a specialized MMD (MikuMikuDance) pose generator.
### Pose Definitions
@pose kick_left {
    leg_l bend forward 30;
    knee_l bend backward 0;
    leg_r bend backward 20;
    knee_r bend backward 15;
}
@pose kick_right {
    leg_r bend forward 30;
    knee_r bend backward 0;
    leg_l bend backward 20;
    knee_l bend backward 15;
}

### Animation Sequences
@animation walk {
    0: kick_left;
    0.3: kick_right;
    0.6: kick_left;
    0.9: kick_right;
}
### Main Execution
main {
    walk;
}
## Supported Bones

**Body Core:** base, center, upper_body, lower_body, waist, neck, head  
**Arms:** shoulder_l/r, arm_l/r, elbow_l/r, wrist_l/r  
**Legs:** leg_l/r, knee_l/r, ankle_l/r, toe_l/r  
**Fingers:** thumb_l/r, index_l/r, middle_l/r, ring_l/r, pinky_l/r

## Bone Commands

**Format:** bone action direction amount; or bone reset;

**Actions:** bend, turn, sway, move, reset  
**Directions:** forward, backward, left, right, up, down

### Compound Statements

Multiple actions for the same bone can be combined on a single line using commas:


head turn left 30, bend forward 20, sway right 15;
arm raise up 45, rotate right 15;
neck reset;        
`);
    const [seed, setSeed] = useState(42);
    const [maxTokens, setMaxTokens] = useState(1024);
    const [topP, setTopP] = useState(1);
    const [presencePenalty, setPresencePenalty] = useState(0);
    const [frequencyPenalty, setFrequencyPenalty] = useState(0);

    const loadModel = async () => {
        try {
            setLoading(true);
            setError(null);

            const appConfig: webllm.AppConfig = {
                model_list: [
                    {
                        model: `${window.origin}/Qwen3-4B-q4f16_1-MLC`,
                        model_id: "Qwen3-4B-q4f16_1-MLC",
                        model_lib:
                            webllm.modelLibURLPrefix +
                            webllm.modelVersion +
                            "/Qwen3-4B-q4f16_1-ctx4k_cs1k-webgpu.wasm",
                        vram_required_MB: 3431.59,
                        low_resource_required: true,
                        overrides: {
                            context_window_size: contextWindow,
                        },
                    },
                ],
            };

            //mlc-ai/
            // Настраиваем отслеживание прогресса
            const selectedModel = "Qwen3-4B-q4f16_1-MLC";

            const engine = await webllm.CreateMLCEngine(
                selectedModel,
                {
                    initProgressCallback: (rep) => {
                        console.log(rep.progress)
                    },
                    appConfig: appConfig
                } // engineConfig
            );
            chatRef.current = engine;
            setModelReady(true);
            console.log("Model loaded successfully");
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "Failed to load model";
            setError(errorMessage);
            console.error("Model loading error:", err);
        } finally {
            setLoading(false);
        }
    };
    // Replace custom <think> tags with a richly styled HTML block so ReactMarkdown + rehype-raw can render it
    const transformThinkTags = (text: string | null | undefined, visible = true) => {
        if (!text) return "";
        // Base classes for the think block; when hidden we add 'hidden'
        const base = 'think bg-gradient-to-r from-[#0f0520] to-[#201035] border-l-4 border-purple-400/80 p-4 rounded-lg shadow-lg backdrop-blur-sm text-white';
        const cls = visible ? base : base + ' hidden';

        // Header inside the think block with a badge and pulsing dot
        const headerHtml = `<div class="flex items-center gap-3 mb-2"><span class="text-xs font-semibold text-purple-200 bg-purple-900/30 px-2 py-0.5 rounded">${translate('think.header')}</span><span class="inline-flex items-center text-xs text-white/70 gap-1"><span class="w-2 h-2 bg-purple-300 rounded-full animate-pulse"></span><span class="opacity-80">...</span></span></div>`;

        // Opening wrapper includes header and content container
        const open = `<div class="${cls}">${headerHtml}<div class="think-content prose prose-invert max-w-none text-sm">`;
        const close = `</div></div>`;

        return text
            .replace(/<think>/gi, open)
            .replace(/<\/think>/gi, close);
    }

    const generatePose = async (prompt: string) => {
        if (!chatRef.current) return null;

        try {
            const enhancedPrompt = `${prompt}`;

            const messages = [
                { role: "system", content: systemPrompt },
                { role: "user", content: enhancedPrompt },
            ]

            setIsStreaming(true);
            setStreamingText("");

            const chunks = await chatRef.current.chat.completions.create({
                messages: messages as any,
                temperature,
                stream: true,
                stream_options: { include_usage: true },
                seed,
                max_tokens: maxTokens,
                top_p: topP,
                presence_penalty: presencePenalty,
                frequency_penalty: frequencyPenalty,
            });

            let streamedText = "";
            for await (const chunk of chunks) {
                const newContent = chunk.choices[0]?.delta.content || "";
                streamedText += newContent;
                setStreamingText(streamedText);

                if (chunk.usage) {
                    console.log("Token usage:", chunk.usage);
                }
            }

            setIsStreaming(false);
            return streamedText;
        } catch (err) {
            console.error("Pose generation error:", err);
            throw err;
        }
    };

    useEffect(() => {
        loadModel();
        return () => {
            if (chatRef.current) {
                chatRef.current.unload();
            }
        };
    }, []);

    const [prompt, setPrompt] = useState("");
    const [result, setResult] = useState<string | null>(null);
    const [progress, setProgress] = useState(0);
    // Batch mode state
    const [batchMode, setBatchMode] = useState(false);
    const [batchResults, setBatchResults] = useState<Array<{ prompt: string, result?: string, status: 'pending' | 'running' | 'done' | 'error' }>>([]);
    const [isBatching, setIsBatching] = useState(false);

    const handleGeneratePose = async () => {
        if (!prompt.trim() || !chatRef.current) return;

        // Batch mode: multiple prompts separated by newline
        if (batchMode) {
            const lines = prompt.split('\n').map(l => l.trim()).filter(Boolean);
            if (lines.length === 0) return;

            setIsBatching(true);
            setLoading(true);
            setError(null);

            const results = lines.map(p => ({ prompt: p, status: 'pending' as const }));
            setBatchResults(results);

            for (let i = 0; i < lines.length; i++) {
                const p = lines[i];
                setBatchResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'running' } : r));
                try {
                    const response = await generatePose(p);
                    let formatted = response ?? "";
                    const poseData = JSON.parse(response!);
                    formatted = "```json\n" + JSON.stringify(poseData, null, 2) + "\n```";
                    setBatchResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'done', result: formatted } : r));
                } catch (err) {
                    setBatchResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'error', result: (err instanceof Error ? err.message : String(err)) } : r));
                }
            }

            setIsBatching(false);
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            setError(null);
            const response = await generatePose(prompt);
            try {
                const poseData = JSON.parse(response!);
                setResult("```json\n" + JSON.stringify(poseData, null, 2) + "\n```");
            } catch {
                setResult(response);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to generate pose");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col gap-4 p-6 max-w-3xl mx-auto bg-black/20 border border-white/5 rounded-xl mt-6">
            <h2 className="text-2xl font-bold mb-2">{translate('textToPose.title')}</h2>

            {/* Advanced model settings */}
            <div className="mb-2">
                <button
                    className="text-xs text-purple-300 bg-purple-900/40 px-2 py-1 rounded hover:bg-purple-800/60 border border-purple-400/30"
                    onClick={() => setAdvancedOpen(v => !v)}
                >
                    {advancedOpen ? translate('advanced.hide') : translate('advanced.show')}
                </button>
                {advancedOpen && (
                    <div className="mt-2 p-3 bg-gradient-to-br from-black/60 to-purple-950/40 border border-purple-400/20 rounded-xl flex flex-col gap-3 shadow-lg">
                        <div className="flex flex-wrap gap-4">
                            <div className="flex flex-col gap-1 w-32">
                                <label className="text-xs text-white/70">{translate('advanced.temperature')}</label>
                                <input type="number" min={0} max={2} step={0.01} value={temperature} onChange={e => setTemperature(Number(e.target.value))} className="bg-black/30 border border-purple-400/30 rounded px-2 py-1 text-white focus:ring-2 focus:ring-purple-400 transition" />
                            </div>
                            <div className="flex flex-col gap-1 w-32">
                                <label className="text-xs text-white/70">{translate('advanced.contextWindow')}</label>
                                <input type="number" min={512} max={32768} step={1} value={contextWindow} onChange={e => setContextWindow(Number(e.target.value))} className="bg-black/30 border border-purple-400/30 rounded px-2 py-1 text-white focus:ring-2 focus:ring-purple-400 transition" />
                            </div>
                            <div className="flex flex-col gap-1 w-32">
                                <label className="text-xs text-white/70">{translate('advanced.seed')}</label>
                                <input type="number" min={0} max={999999} step={1} value={seed} onChange={e => setSeed(Number(e.target.value))} className="bg-black/30 border border-purple-400/30 rounded px-2 py-1 text-white focus:ring-2 focus:ring-purple-400 transition" />
                            </div>
                            <div className="flex flex-col gap-1 w-32">
                                <label className="text-xs text-white/70">{translate('advanced.maxTokens')}</label>
                                <input type="number" min={1} max={4096} step={1} value={maxTokens} onChange={e => setMaxTokens(Number(e.target.value))} className="bg-black/30 border border-purple-400/30 rounded px-2 py-1 text-white focus:ring-2 focus:ring-purple-400 transition" />
                            </div>
                            <div className="flex flex-col gap-1 w-32">
                                <label className="text-xs text-white/70">{translate('advanced.topP')}</label>
                                <input type="number" min={0} max={1} step={0.01} value={topP} onChange={e => setTopP(Number(e.target.value))} className="bg-black/30 border border-purple-400/30 rounded px-2 py-1 text-white focus:ring-2 focus:ring-purple-400 transition" />
                            </div>
                            <div className="flex flex-col gap-1 w-32">
                                <label className="text-xs text-white/70">{translate('advanced.presencePenalty')}</label>
                                <input type="number" min={-2} max={2} step={0.01} value={presencePenalty} onChange={e => setPresencePenalty(Number(e.target.value))} className="bg-black/30 border border-purple-400/30 rounded px-2 py-1 text-white focus:ring-2 focus:ring-purple-400 transition" />
                            </div>
                            <div className="flex flex-col gap-1 w-32">
                                <label className="text-xs text-white/70">{translate('advanced.frequencyPenalty')}</label>
                                <input type="number" min={-2} max={2} step={0.01} value={frequencyPenalty} onChange={e => setFrequencyPenalty(Number(e.target.value))} className="bg-black/30 border border-purple-400/30 rounded px-2 py-1 text-white focus:ring-2 focus:ring-purple-400 transition" />
                            </div>
                        </div>
                        <div className="flex flex-col gap-1 mt-2">
                            <label className="text-xs text-white/70">{translate('advanced.systemPrompt')}</label>
                            <textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} className="bg-black/30 border border-purple-400/30 rounded px-2 py-1 text-white w-full h-16 focus:ring-2 focus:ring-purple-400 transition" />
                        </div>
                        <div className="flex flex-row gap-2 mt-2">
                            <button className="text-xs text-white bg-purple-700/80 px-2 py-1 rounded hover:bg-purple-800/90 border border-purple-400/30" onClick={() => alert('Окно системных настроек (заглушка)')}>{translate('advanced.openSystem')}</button>
                        </div>
                    </div>
                )}
            </div>

            {!modelReady && !error && (
                <div className="bg-white/5 border border-white/5 text-white/80 px-4 py-3 rounded">
                    {translate('status.loadingModel')} {progress > 0 ? `${Math.round(progress * 100)}%` : ''}
                </div>
            )}

            {error && (
                <div className="bg-red-900/50 border border-red-600/20 text-red-300 px-4 py-3 rounded">
                    {error}
                </div>
            )}

            <div className="flex flex-col gap-3">
                <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder={translate('textToPose.placeholder')}
                    className="w-full p-3 border border-white/10 rounded-md h-32 bg-black/40 text-white placeholder:text-white/60"
                    disabled={loading || !modelReady}
                />
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleGeneratePose}
                        disabled={loading || !modelReady}
                        className={`px-4 py-2 rounded-md ${loading || !modelReady
                            ? "bg-gray-600/40"
                            : "bg-purple-600 hover:bg-purple-700"
                            } text-white`}
                    >
                        {loading ? translate('button.generating') : translate('button.generate')}
                    </button>
                    <div className="text-sm text-white/70">Model: <span className="text-white/90">{modelReady ? translate('status.modelReady') : translate('status.modelLoading')}</span></div>
                </div>
            </div>

            {(isStreaming || result) && (
                <div className="mt-4">
                    <h3 className="text-lg font-semibold mb-2">{translate('result.heading')}</h3>
                    <div className="relative">
                        {isStreaming && (
                            <div className="markdown prose dark:prose-invert max-w-none">
                                <div className="bg-[#0f0f14]/80 border border-white/5 p-4 rounded-md overflow-x-auto text-sm text-white">
                                    {/* Header for thinking block with toggle */}
                                    {/<think>/i.test(streamingText) && (
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="text-sm font-medium text-purple-200">{translate('think.header')}</div>
                                            <button
                                                onClick={() => setThinkVisible(v => !v)}
                                                className="text-sm text-white/80 bg-white/3 px-2 py-1 rounded border border-white/5 hover:bg-white/5"
                                            >
                                                {thinkVisible ? translate('think.hide') : translate('think.show')}
                                            </button>
                                        </div>
                                    )}
                                    {md ? (
                                        <div dangerouslySetInnerHTML={{ __html: md.render(transformThinkTags(streamingText, thinkVisible)) }} />
                                    ) : (
                                        <pre className="whitespace-pre-wrap">{transformThinkTags(streamingText, thinkVisible).replace(/<[^>]+>/g, '')}</pre>
                                    )}
                                </div>
                            </div>
                        )}
                        {!isStreaming && result && (
                            <div className="markdown prose dark:prose-invert max-w-none">
                                <div className="bg-[#0f0f14]/80 border border-white/5 p-4 rounded-md overflow-x-auto text-sm text-white">
                                    {/* Header for thinking block with toggle */}
                                    {/<think>/i.test(result) && (
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="text-sm font-medium text-purple-200">{translate('think.header')}</div>
                                            <button
                                                onClick={() => setThinkVisible(v => !v)}
                                                className="text-sm text-white/80 bg-white/3 px-2 py-1 rounded border border-white/5 hover:bg-white/5"
                                            >
                                                {thinkVisible ? translate('think.hide') : translate('think.show')}
                                            </button>
                                        </div>
                                    )}
                                    {md ? (
                                        <div dangerouslySetInnerHTML={{ __html: md.render(transformThinkTags(result, thinkVisible)) }} />
                                    ) : (
                                        <pre className="whitespace-pre-wrap">{transformThinkTags(result, thinkVisible).replace(/<[^>]+>/g, '')}</pre>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}