import { HolisticLandmarkerResult, NormalizedLandmark } from "@mediapipe/tasks-vision"

export class HolisticParser {
    mainBody: NormalizedLandmark[]
    leftWorldFingers: NormalizedLandmark[]
    rightWorldFingers: NormalizedLandmark[]
    poseLandmarks: NormalizedLandmark[]
    faceLandmarks: NormalizedLandmark[]
    constructor(holisticResult: HolisticLandmarkerResult) {
        this.mainBody = holisticResult.poseWorldLandmarks?.[0] || [];
        this.leftWorldFingers = holisticResult.leftHandLandmarks?.[0] || [];
        this.rightWorldFingers = holisticResult.rightHandLandmarks?.[0] || [];
        this.poseLandmarks = holisticResult.poseLandmarks?.[0] || [];
        this.faceLandmarks = holisticResult.faceLandmarks?.[0] || [];
    }

    static ParseHolistic(holisticResult: HolisticLandmarkerResult): HolisticParser {
        return new HolisticParser(holisticResult);
    }
}