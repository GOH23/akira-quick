import { HandsConfig, HandsInterface, InputMap, Options, ResultsListener } from "@mediapipe/hands";

declare global {
    class Hands  implements HandsInterface{
        constructor(config?: HandsConfig);
        close(): Promise<void>;
        onResults(listener: ResultsListener): void;
        initialize(): Promise<void>;
        reset(): void;
        send(inputs: InputMap): Promise<void>;
        setOptions(options: Options): void;
    }
}

export { };