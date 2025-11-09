import { Quaternion, Vector3 } from "@babylonjs/core"

export const poseKeypoints: { [key: string]: number } = {
    nose: 0,
    left_eye_inner: 1,
    left_eye: 2,
    left_eye_outer: 3,
    right_eye_inner: 4,
    right_eye: 5,
    right_eye_outer: 6,
    left_ear: 7,
    right_ear: 8,
    mouth_left: 9,
    mouth_right: 10,
    left_shoulder: 11,
    right_shoulder: 12,
    left_elbow: 13,
    right_elbow: 14,
    left_wrist: 15,
    right_wrist: 16,
    left_pinky: 17,
    right_pinky: 18,
    left_index: 19,
    right_index: 20,
    left_thumb: 21,
    right_thumb: 22,
    left_hip: 23,
    right_hip: 24,
    left_knee: 25,
    right_knee: 26,
    left_ankle: 27,
    right_ankle: 28,
    left_heel: 29,
    right_heel: 30,
    left_foot_index: 31,
    right_foot_index: 32,
}

export const faceKeypoints: { [key: string]: number } = {
    left_eye_upper: 159,
    left_eye_lower: 145,
    left_eye_left: 33,
    left_eye_right: 133,
    left_eye_iris: 468,
    right_eye_upper: 386,
    right_eye_lower: 374,
    right_eye_left: 362,
    right_eye_right: 263,
    right_eye_iris: 473,
    upper_lip_top: 13,
    lower_lip_bottom: 14,
    mouth_left: 61,
    mouth_right: 291,
    upper_lip_center: 0,
    lower_lip_center: 17,
    left_corner: 291,
    right_corner: 61,
    left_ear: 234,
    right_ear: 454,
}

export const handKeypoints: { [key: string]: number } = {
    wrist: 0,
    thumb_cmc: 1,
    thumb_mcp: 2,
    thumb_ip: 3,
    thumb_tip: 4,
    index_mcp: 5,
    index_pip: 6,
    index_dip: 7,
    index_tip: 8,
    middle_mcp: 9,
    middle_pip: 10,
    middle_dip: 11,
    middle_tip: 12,
    ring_mcp: 13,
    ring_pip: 14,
    ring_dip: 15,
    ring_tip: 16,
    pinky_mcp: 17,
    pinky_pip: 18,
    pinky_dip: 19,
    pinky_tip: 20,
}

export type BoneType = "hand" | "pose" | "face"
// Константы для имен костей
export enum MMDModelBones {
    UpperBody = "上半身",
    LowerBody = "下半身",
    LeftArm = "左腕",
    RightArm = "右腕",
    LeftElbow = "左ひじ",
    RightElbow = "右ひじ",
    LeftWrist = "左手首",
    RightWrist = "右手首",
    LeftHip = "左足",
    RightHip = "右足",
    LeftAnkle = "左足首",
    RightAnkle = "右足首",
    RightKnee = "右ひざ",
    LeftKnee = "左ひざ",
    LeftFootIK = "左足ＩＫ",
    RightFootIK = "右足ＩＫ",
    LeftWristTwist = "左手捩",
    RightWristTwist = "右手捩",
    Neck = "首",
    Head = "頭",
    RootBone = "全ての親",
    LeftEye = "左目",
    RightEye = "右目",
    Eyebrows = "眉",
    Mouth = "口",
    
    LeftThumb1 = "左親指１",
    LeftThumb2 = "左親指２",
    LeftIndex0 = "左人指１",
    LeftIndex1 = "左人指２",
    LeftIndex2 = "左人指３",
    LeftMiddle0 = "左中指１",
    LeftMiddle1 = "左中指２",
    LeftMiddle2 = "左中指３",
    LeftRing0 = "左薬指１",
    LeftRing1 = "左薬指２",
    LeftRing2 = "左薬指３",
    LeftLittle0 = "左小指１",
    LeftLittle1 = "左小指２",
    LeftLittle2 = "左小指３",

    RightThumb1 = "右親指１",
    RightThumb2 = "右親指２",
    RightIndex0 = "右人指１",
    RightIndex1 = "右人指２",
    RightIndex2 = "右人指３",
    RightMiddle0 = "右中指１",
    RightMiddle1 = "右中指２",
    RightMiddle2 = "右中指３",
    RightRing0 = "右薬指１",
    RightRing1 = "右薬指２",
    RightRing2 = "右薬指３",
    RightLittle0 = "右小指１",
    RightLittle1 = "右小指２",
    RightLittle2 = "右小指３"
}
export function getFingerBones(isRight: boolean): string[] {
    if (isRight) {
        return [
            MMDModelBones.RightThumb1,
            MMDModelBones.RightThumb2,
            MMDModelBones.RightIndex0,
            MMDModelBones.RightIndex1,
            MMDModelBones.RightIndex2,
            MMDModelBones.RightMiddle0,
            MMDModelBones.RightMiddle1,
            MMDModelBones.RightMiddle2,
            MMDModelBones.RightRing0,
            MMDModelBones.RightRing1,
            MMDModelBones.RightRing2,
            MMDModelBones.RightLittle0,
            MMDModelBones.RightLittle1,
            MMDModelBones.RightLittle2
        ];
    } else {
        return [
            MMDModelBones.LeftThumb1,
            MMDModelBones.LeftThumb2,
            MMDModelBones.LeftIndex0,
            MMDModelBones.LeftIndex1,
            MMDModelBones.LeftIndex2,
            MMDModelBones.LeftMiddle0,
            MMDModelBones.LeftMiddle1,
            MMDModelBones.LeftMiddle2,
            MMDModelBones.LeftRing0,
            MMDModelBones.LeftRing1,
            MMDModelBones.LeftRing2,
            MMDModelBones.LeftLittle0,
            MMDModelBones.LeftLittle1,
            MMDModelBones.LeftLittle2
        ];
    }
}
export type KeyFrameType = {
    keyNum: number;
    keyData: {
        boneName: string;
        position: Float32Array;
        quaternion: Float32Array;
    }[];
    morphData: {
        name: string,
        weight: number
    }[]
}
export type VideosKeyFrameType = {
    currentVideoIndex: number
    keyFrames: KeyFrameType[]
}
export type SETTINGS_CONFIGType = {
    POSE_Y_SCALE: number
}
export type FingersType = Record<string, Quaternion>
export const HUMAN_LIMITS = {
    HIP_X: [-0.5, 0.5],       // Вращение бедра вперед/назад
    HIP_Y: [-0.3, 0.3],       // Отведение бедра в сторону
    HIP_Z: [-0.4, 0.4],       // Вращение бедра внутрь/наружу
    KNEE_Y: [0, 2.0]          // Сгибание колена
};
export const RightRefFingersVector = {
    Thumb1: new Vector3(-0.6236753178947897, -0.7034896546159694, -0.34078057998826367).normalize(),
    Index1: new Vector3(-0.8432487044803304, -0.5368678957658006, 0.026542134206687714).normalize(),
    Middle1: new Vector3(-0.830394244494938, -0.5566311582035673, 0.024640463198495298).normalize(),
    Ring1: new Vector3(-0.8076382239720394, -0.5884013252930373, 0.03878633229228).normalize(),
    Pinky1: new Vector3(-0.8462155810704232, -0.5276077240369134, 0.07449348891167894).normalize(),
}
export const LeftRefFingersVector = {
    Thumb1:  new Vector3(0.6236582921350833, -0.7035050354478427, -0.34077998730952624).normalize(),
    Index1: new Vector3(0.8432431728071625, -0.5368768421934949, 0.026536914486258466).normalize(),
    Middle1: new Vector3(0.8303922987881693, -0.5566343204926274, 0.02463459687127938).normalize(),
    Ring1: new Vector3(0.8076445279586488, -0.5883930602992032, 0.038780446750771254).normalize(),
    Pinky1: new Vector3(0.8462256262210587, -0.5275922475926769, 0.07448899117913084).normalize(),
}