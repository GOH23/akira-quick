import { Matrix, Quaternion, Space, Vector3 } from "@babylonjs/core";
import { HolisticLandmarkerResult, Landmark, NormalizedLandmark } from "@mediapipe/tasks-vision";
import { MmdWasmModel } from "babylon-mmd";
import { IMmdRuntimeLinkedBone } from "babylon-mmd/esm/Runtime/IMmdRuntimeLinkedBone";
import { BoneType, faceKeypoints, FingersType, getFingerBones, handKeypoints, HUMAN_LIMITS, KeyFrameType, LeftRefFingersVector, MMDModelBones, poseKeypoints, RightRefFingersVector, VideosKeyFrameType } from "./MotionTypes";
import { KalmanVectorFilter, OneEuroVectorFilter } from "./Filters";
import * as Kalidokit from 'kalidokit'
import { clamp } from "kalidokit/dist/utils/helpers";
import { HolisticParser } from "./HolisticParser";

// Module-level immutable reference vectors to avoid allocating identical Vector3s every frame.
const REF_NECK = new Vector3(0, 0.9758578206707508, -0.21840676233975218).normalize();
const REF_HORIZONTAL = new Vector3(1, 0, 0).normalize();
const REF_VERTICAL_NEG_Z = new Vector3(0, 0, -1).normalize();
const REF_DEFAULT_DIR = new Vector3(0, 0, 1);
const REF_WRIST_LEFT = new Vector3(0.72573996, -0.40247154, -0.01692206).normalize();
const REF_WRIST_RIGHT = new Vector3(-0.72573996, -0.40247154, 0.01692206).normalize();
const REF_ELBOW_LEFT = new Vector3(0.7991214493734219, -0.600241324846603, -0.03339552511514752).normalize();
const REF_ELBOW_RIGHT = new Vector3(-0.7991213083626819, -0.6002415122251716, -0.03339553147285845).normalize();
const REF_HIP_DIR = new Vector3(-0.009540689177369048, -0.998440855265296, 0.05499848895310636).normalize();
const REF_SHOULDER_LEFT = new Vector3(0.8012514930735141, -0.5966378711527615, -0.04493657256361681).normalize();
const REF_SHOULDER_RIGHT = new Vector3(-0.8020376176381924, -0.5972232450219962, -0.007749548286792409).normalize();
// Finger bend axis constants (normalized)
const FINGER_THUMB_LEFT = new Vector3(-1.0, -1.0, 0.0).normalize();
const FINGER_THUMB_RIGHT = new Vector3(-1.0, 1.0, 0.0).normalize();
const FINGER_INDEX_BEND = new Vector3(-0.031, 0.0, -0.993).normalize();
const FINGER_MIDDLE_BEND = new Vector3(0.03, 0.0, 0.996).normalize();
const FINGER_PINKY_BEND = new Vector3(0.088, 0.0, 0.997).normalize();

export class MotionModel {
    public _Model?: MmdWasmModel
    public boneMap: Map<string, IMmdRuntimeLinkedBone> = new Map();
    public keyframes: VideosKeyFrameType[] = []
    public CONFIG = {
        LERP_FACTOR: 0.3,
        EYE_MOVEMENT_SCALE: 0.05,
        POSE_SETTINGS_SCALE: 1.5
    };
    private _filters: { [key: string]: OneEuroVectorFilter } = {};
    // small set of reusable temporaries to reduce per-frame allocations
    private _tmpMatrix1 = new Matrix();
    private _tmpMatrix2 = new Matrix();
    private _tmpQuat = new Quaternion();
    private _tmpVec = new Vector3();
    private _tmpVec2 = new Vector3();
    leftFingerData = getFingerBones(false);
    rightfingerData = getFingerBones(true);
    constructor(private lerpFactor: number = 0.3) { }

    searchBone(name: string | MMDModelBones) {
        return this.boneMap.get(name);
    }
    init(Model: MmdWasmModel) {
        this._Model = Model;
        this._Model.skeleton.bones.forEach((el) => {
            this.boneMap.set(el.name, el);
        })
    }
    setRotation(boneName: MMDModelBones, rotation: Quaternion, Space: Space = 0, lerpFactor: number = this.lerpFactor): void {
        if (this.boneMap.size > 0) {
            const bone = this.boneMap.get(boneName);
            if (bone) {
                bone.setRotationQuaternion(Quaternion.Slerp(bone.rotationQuaternion, rotation, lerpFactor),
                    Space
                )
            }
        }
    }
    motionCalculate(holisticResult: HolisticLandmarkerResult, currentVideoIndex: number) {
        if (!this._Model) return;

        const now = Date.now();

        const parser = new HolisticParser(holisticResult);
        let UpperBodyRotation: Quaternion | undefined = undefined;
        let NeckRotation: Quaternion | undefined = undefined;
        let LowerBodyRotation: Quaternion | undefined = undefined;
        let HeadRotation: Quaternion | undefined = undefined;
        let leftArmRots: [Quaternion, Quaternion, Quaternion, Quaternion] | undefined = undefined;
        let rightArmRots: [Quaternion, Quaternion, Quaternion, Quaternion] | undefined = undefined;
        let leftLegRots: [Quaternion, Quaternion] | undefined = undefined;
        let rightLegRots: [Quaternion, Quaternion] | undefined = undefined;
    UpperBodyRotation = this.calculateUpperBodyRotation(parser.mainBody, now);
        LowerBodyRotation = this.calculateLowerBodyRotation(parser.mainBody, now);
        NeckRotation = this.calculateNeckRotation(parser.mainBody, UpperBodyRotation);
        HeadRotation = this.calculateHeadRotation(parser.mainBody, UpperBodyRotation, NeckRotation);
        leftArmRots = this.calculateArmRotation(
            parser.mainBody,
            parser.leftWorldFingers,
            {
                upperBodyRot: UpperBodyRotation,
                lowerBodyRot: LowerBodyRotation,
            },
            false,
            now
        );
        rightArmRots = this.calculateArmRotation(
            parser.mainBody,
            parser.rightWorldFingers,
            {
                upperBodyRot: UpperBodyRotation,
                lowerBodyRot: LowerBodyRotation,
            },
            true,
            now
        );

        leftLegRots = this.calculateLegRotation(
            parser.mainBody,
            "left_hip",
            "left_knee",
            "left_ankle",
            LowerBodyRotation,
            now
        );
        rightLegRots = this.calculateLegRotation(
            parser.mainBody,
            "right_hip",
            "right_knee",
            "right_ankle",
            LowerBodyRotation,
            now
        );
        let leftFingers = this.calculateFingerRotation(
            {
                arms: leftArmRots,
                upperBody: UpperBodyRotation
            },
            parser.leftWorldFingers,
            false
        )
        let rightFingers = this.calculateFingerRotation(
            {
                arms: rightArmRots,
                upperBody: UpperBodyRotation
            },
            parser.rightWorldFingers,
            true
        )


        Object.keys(leftFingers).map((el) => {
            this.setRotation(el as MMDModelBones, leftFingers[el])
        })
        Object.keys(rightFingers).map((el) => {
            this.setRotation(el as MMDModelBones, rightFingers[el])
        })
        this.moveBody(parser.poseLandmarks, now);
        this.setRotation(MMDModelBones.UpperBody, UpperBodyRotation);
        this.setRotation(MMDModelBones.Neck, NeckRotation)
        this.setRotation(MMDModelBones.LowerBody, LowerBodyRotation);


        if (leftArmRots && rightArmRots) {
            this.setRotation(MMDModelBones.RightArm, rightArmRots[0]);
            this.setRotation(MMDModelBones.LeftArm, leftArmRots[0]);
            this.setRotation(MMDModelBones.RightElbow, rightArmRots[1]);
            this.setRotation(MMDModelBones.LeftElbow, leftArmRots[1]);
            this.setRotation(MMDModelBones.RightWristTwist, rightArmRots[2]);
            this.setRotation(MMDModelBones.LeftWristTwist, leftArmRots[2]);
            this.setRotation(MMDModelBones.RightWrist, rightArmRots[3]);
            this.setRotation(MMDModelBones.LeftWrist, leftArmRots[3]);
        }
        if (leftLegRots && rightLegRots) {
            this.setRotation(MMDModelBones.LeftHip, leftLegRots[0]);
            this.setRotation(MMDModelBones.LeftAnkle, leftLegRots[1], Space.WORLD);
            this.setRotation(MMDModelBones.RightHip, rightLegRots[0]);
            this.setRotation(MMDModelBones.RightAnkle, rightLegRots[1], Space.WORLD);
            this.moveFoot("left", parser.mainBody);
            this.moveFoot("right", parser.mainBody);
        }
        if (HeadRotation) {
            this.setRotation(MMDModelBones.Head, HeadRotation);
        }

        this.updateFacialExpressions(parser.faceLandmarks);
        this.updateEyeMovement(parser.faceLandmarks);
        //this.rotateFingers(parser.leftWorldFingers, "left");
        //this.rotateFingers(parser.rightWorldFingers, "right");
        var videoMotion = this.keyframes.find((el) => el.currentVideoIndex == currentVideoIndex)
        if (!videoMotion) {
            this.keyframes.push({
                currentVideoIndex: currentVideoIndex,
                keyFrames: [
                    {
                        keyNum: this.keyframes.length + 1,
                        keyData: this.get_keyframe_data(),
                        morphData: this.get_morph_data()
                    }
                ]
            })
        } else {
            videoMotion.keyFrames.push({
                keyNum: this.keyframes.length + 1,
                keyData: this.get_keyframe_data(),
                morphData: this.get_morph_data()
            })
        }

        this._Model.skeleton.prepare();
    }
    get_keyframe_data() {
        var res: KeyFrameType["keyData"] = []
        this.boneMap.forEach((el) => {
            res.push({
                boneName: el.name,
                position: new Float32Array([el.position.x, el.position.y, el.position.z]),
                quaternion: new Float32Array([el.rotationQuaternion.x, el.rotationQuaternion.y, el.rotationQuaternion.z, el.rotationQuaternion.w])
            })
        })
        return res;
    }
    get_morph_data() {
        if (!this._Model) return []
        return [
            ...this._Model.morph.morphs.map((el) => {
                return { name: el.name, weight: this._Model!.morph.getMorphWeight(el.name) }
            })
        ]
    }
    moveBody(bodyLand: NormalizedLandmark[], now: number): void {
        const hipLeft3D = this.getPoseKeyPoint(bodyLand, "left_hip");
        const hipRight3D = this.getPoseKeyPoint(bodyLand, "right_hip");
        const shoulderLeft3D = this.getPoseKeyPoint(bodyLand, "left_shoulder");
        const shoulderRight3D = this.getPoseKeyPoint(bodyLand, "right_shoulder");

        if (!hipLeft3D || !hipRight3D || !shoulderLeft3D || !shoulderRight3D) return;

        // Применяем фильтрацию для сглаживания движений
        const hipLeftFiltered = new OneEuroVectorFilter(0, Vector3.Zero(), Vector3.Zero(), 0.5, 0.1).next(now, hipLeft3D);
        const hipRightFiltered = new OneEuroVectorFilter(0, Vector3.Zero(), Vector3.Zero(), 0.5, 0.1).next(now, hipRight3D);
        const shoulderLeftFiltered = new OneEuroVectorFilter(0, Vector3.Zero(), Vector3.Zero(), 0.5, 0.1).next(now, shoulderLeft3D);
        const shoulderRightFiltered = new OneEuroVectorFilter(0, Vector3.Zero(), Vector3.Zero(), 0.5, 0.1).next(now, shoulderRight3D);

        const hipCenter3D = Vector3.Center(
            hipLeftFiltered,
            hipRightFiltered
        );
        const shoulderCenter3D = Vector3.Center(
            shoulderLeftFiltered,
            shoulderRightFiltered
        );
        const spineLength = Vector3.Distance(hipCenter3D, shoulderCenter3D);
        const spineLengthNormalized = Kalidokit.Utils.clamp(spineLength - 1, -2, 0);
        const dampingFactor = 0.7; // Коэффициент демпфирования для горизонтальных движений
        const hipsWorldPosition = {
            x: Kalidokit.Utils.clamp(hipCenter3D.x - 0.4, -1, 1) * dampingFactor,
            y: 0,
            z: spineLengthNormalized * Math.pow(spineLengthNormalized * -2, 2)
        };
        hipsWorldPosition.x *= hipsWorldPosition.z;
        const rootBone = this.searchBone(MMDModelBones.RootBone);
        if (!rootBone) return;
        const stableYPosition = (hipCenter3D.y);
        const mmdPosition = new Vector3(
            -hipsWorldPosition.x * 25,
            stableYPosition,
            hipsWorldPosition.z * 0.8 // Уменьшаем движение по Z
        );
        const smoothingFactor = Math.min(this.CONFIG.LERP_FACTOR, 0.2);

        rootBone.position = Vector3.Lerp(
            rootBone.position,
            mmdPosition,
            smoothingFactor
        );
    }
    updateFacialExpressions(faceLandmarks: NormalizedLandmark[]): void {
        const targetWeights = this.calculateFacialExpressions(faceLandmarks);
        Object.keys(targetWeights).forEach((morphName) => {
            var _currentMorphWeights = this._Model?.morph.getMorphWeight(morphName)
            const current = _currentMorphWeights || 0;
            const target = targetWeights[morphName];
            const newWeight = current + (target - current) * this.lerpFactor;
            this._Model?.morph?.setMorphWeight(morphName, Math.min(Math.max(newWeight, 0), 1));
        });
    }
    landmarkDistance(a?: NormalizedLandmark, b?: NormalizedLandmark): number {
        if (!a || !b) return 0;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dz = a.z - b.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    // Helper: Average Y of multiple landmarks
    avgY(landmarks: (NormalizedLandmark | undefined)[]): number {
        const valid = landmarks.filter(l => l != null) as NormalizedLandmark[];
        if (valid.length === 0) return 0;
        return valid.reduce((sum, l) => sum + l.y, 0) / valid.length;
    }
    calculateFacialExpressions(faceLandmarks: NormalizedLandmark[]): { [key: string]: number } {
        // --- Landmark Indices (MediaPipe Face Mesh 468) ---
        // Eyes
        const LEFT_EYE_UPPER = 159;   // upper lid
        const LEFT_EYE_LOWER = 145;   // lower lid
        const RIGHT_EYE_UPPER = 386;
        const RIGHT_EYE_LOWER = 374;

        // Mouth
        const UPPER_LIP_TOP = 0;      // center top
        const LOWER_LIP_BOTTOM = 17;  // center bottom
        const MOUTH_LEFT = 61;
        const MOUTH_RIGHT = 291;
        const UPPER_LIP_CENTER = 13;
        const LOWER_LIP_CENTER = 14;
        const LEFT_CORNER = 61;
        const RIGHT_CORNER = 291;

        // Eyebrows
        const LEFT_BROW_INNER = 52;
        const LEFT_BROW_OUTER = 70;
        const RIGHT_BROW_INNER = 282;
        const RIGHT_BROW_OUTER = 300;

        // Face scale (inter-ear or inter-eye)
        const LEFT_EAR = 234;
        const RIGHT_EAR = 454;
        const LEFT_EYE_OUT = 130;
        const RIGHT_EYE_OUT = 359;

        // --- Get points ---
        const get = (idx: number): NormalizedLandmark => faceLandmarks[idx];

        const leftEyeUpper = get(LEFT_EYE_UPPER);
        const leftEyeLower = get(LEFT_EYE_LOWER);
        const rightEyeUpper = get(RIGHT_EYE_UPPER);
        const rightEyeLower = get(RIGHT_EYE_LOWER);

        const upperLipTop = get(UPPER_LIP_TOP);
        const lowerLipBottom = get(LOWER_LIP_BOTTOM);
        const mouthLeft = get(MOUTH_LEFT);
        const mouthRight = get(MOUTH_RIGHT);
        const upperLipCenter = get(UPPER_LIP_CENTER);
        const lowerLipCenter = get(LOWER_LIP_CENTER);
        const leftCorner = get(LEFT_CORNER);
        const rightCorner = get(RIGHT_CORNER);

        const leftBrowInner = get(LEFT_BROW_INNER);
        const rightBrowInner = get(RIGHT_BROW_INNER);
        const leftBrowOuter = get(LEFT_BROW_OUTER);
        const rightBrowOuter = get(RIGHT_BROW_OUTER);

        const leftEar = get(LEFT_EAR);
        const rightEar = get(RIGHT_EAR);
        const leftEyeOut = get(LEFT_EYE_OUT);
        const rightEyeOut = get(RIGHT_EYE_OUT);

        // --- Blink ---
        let leftBlink = 0, rightBlink = 0;
        if (leftEyeUpper && leftEyeLower && rightEyeUpper && rightEyeLower) {
            const leftEyeDist = this.landmarkDistance(leftEyeUpper, leftEyeLower);
            const rightEyeDist = this.landmarkDistance(rightEyeUpper, rightEyeLower);
            const faceWidth = this.landmarkDistance(leftEyeOut, rightEyeOut);
            const threshold = faceWidth * 0.08; // adaptive

            leftBlink = Math.max(0, 1 - leftEyeDist / threshold);
            rightBlink = Math.max(0, 1 - rightEyeDist / threshold);
            leftBlink = Math.min(leftBlink, 1);
            rightBlink = Math.min(rightBlink, 1);
        }

        // --- Mouth ---
        const mouthHeight = this.landmarkDistance(upperLipTop, lowerLipBottom);
        const mouthWidthVal = this.landmarkDistance(mouthLeft, mouthRight);
        const faceWidth = this.landmarkDistance(leftEar, rightEar);
        const normalizedMouthHeight = mouthHeight / faceWidth;
        const normalizedMouthWidth = mouthWidthVal / faceWidth;

        const mouthOpenness = Math.min(Math.max((normalizedMouthHeight - 0.02) / 0.08, 0), 1);
        const mouthStretch = (normalizedMouthWidth - 0.28) / 0.06; // >0 = wide (い), <0 = narrow (う)
        let smileStrength = 1;
        // Smile: corner lift
        if (upperLipCenter && lowerLipCenter && leftCorner && rightCorner) {
            const mouthCenter = {
                x: (upperLipCenter.x + lowerLipCenter.x) / 2,
                y: (upperLipCenter.y + lowerLipCenter.y) / 2,
                z: (upperLipCenter.z + lowerLipCenter.z) / 2
            };
            const leftLift = mouthCenter.y - leftCorner.y;   // corner above center → positive lift
            const rightLift = mouthCenter.y - rightCorner.y;
            const avgLift = (leftLift + rightLift) / 2;
            smileStrength = Math.min(Math.max(avgLift / 0.03, 0), 1);
        }

        // --- Eyebrows ---
        const browInnerY = this.avgY([leftBrowInner, rightBrowInner]);
        const browOuterY = this.avgY([leftBrowOuter, rightBrowOuter]);
        const browHeight = browInnerY; // higher Y = lower on screen (inverted)
        const browFurrow = browOuterY - browInnerY; // positive = inner brows raised (困る)

        // --- MMD Morphs ---
        const a_open = Math.pow(mouthOpenness, 1.5);
        const o_open = Math.max(0, mouthOpenness - 0.3) * 1.5;
        const i_shape = Math.max(0, mouthStretch) * 0.8;
        const u_shape = Math.max(0, -mouthStretch) * 0.8;
        const e_shape = Math.max(0, mouthStretch * 0.5) * smileStrength; // wide smile

        const surprise = Math.max(0, mouthOpenness * 0.8 + (0.45 - browHeight) * 3);
        const anger = Math.max(0, (0.5 - browHeight) * 2 + (0.2 - mouthOpenness) * 2);
        const worry = Math.max(0, browFurrow * 3);
        const disgust = Math.max(0, (0.52 - browHeight) * 1.5 + (0.15 - normalizedMouthHeight) * 5);
        const fear = Math.max(0, mouthOpenness * 0.6 + (0.45 - browHeight) * 2 + (1 - leftBlink) * 0.3);
        const deadpan = Math.max(0, (0.3 - mouthOpenness) * 2 + Math.abs(browHeight - 0.5));

        return {
            // Visemes (required for lip-sync)
            // "あ": a_open,
            // "い": i_shape,
            // "う": u_shape,
            // "え": e_shape,
            // "お": o_open,

            // // Emotions
            // "笑い": smileStrength * (1 - mouthOpenness) * 0.9,
            // "笑い歯": smileStrength * mouthOpenness * 1.2,
            "驚き": surprise,
            "怒り": anger,
            "困る": worry,
            "嫌悪": disgust,
            // "恐怖": fear,
            // "じと目": deadpan,

            // Eyes
            "まばたき": leftBlink,
            "まばたき右": rightBlink,
        };
    }
    getKeyPoint(landMark: NormalizedLandmark[] | null, name: string, boneType: BoneType): Vector3 | null {
        if (!landMark || landMark.length == 0) return null;
        switch (boneType) {
            case "face":
                var point = landMark[faceKeypoints[name]]
                const scaleX = 10;
                const scaleY = 10;
                const scaleZ = 5;
                return point ? new Vector3(point.x * scaleX, point.y * scaleY, point.z * scaleZ) : null
            case "hand":
                var point = landMark[handKeypoints[name]]
                return point ? new Vector3(point.x, point.y, point.z) : null
            case "pose":
                var point = landMark[poseKeypoints[name]]
                return point ? new Vector3(point.x, point.y, point.z) : null
            default:
                return null
        }
    }
    getPoseKeyPoint(landMark: NormalizedLandmark[] | null, name: string): Vector3 | null {
        if (!landMark || landMark.length == 0) return null;
        var point = landMark[poseKeypoints[name]]
        return new Vector3(point.x, -point.y, point.z)
    }
    getHandKeyPoint(landMark: NormalizedLandmark[] | null, name: string): Vector3 | null {
        if (!landMark || landMark.length == 0) return null;
        var point = landMark[handKeypoints[name]]
        return point ? new Vector3(point.x, -point.y, point.z) : null
    }
    calculateNeckRotation(mainBody: NormalizedLandmark[] | null,
        upperBodyRotation: Quaternion
    ) {
        const worldLeftEar = this.getPoseKeyPoint(mainBody, "left_ear")
        const worldRightEar = this.getPoseKeyPoint(mainBody, "right_ear")
        const worldLeftShoulder = this.getPoseKeyPoint(mainBody, "left_shoulder")
        const worldRightShoulder = this.getPoseKeyPoint(mainBody, "right_shoulder")
        if (worldLeftEar && worldRightEar && worldLeftShoulder && worldRightShoulder) {
            const upperBodyMatrix = new Matrix()
            Matrix.FromQuaternionToRef(upperBodyRotation, upperBodyMatrix)
            const worldToUpperBody = upperBodyMatrix.invert()

            const localLeftEar = Vector3.TransformCoordinates(worldLeftEar, worldToUpperBody)
            const localRightEar = Vector3.TransformCoordinates(worldRightEar, worldToUpperBody)
            const localLeftShoulder = Vector3.TransformCoordinates(worldLeftShoulder, worldToUpperBody)
            const localRightShoulder = Vector3.TransformCoordinates(worldRightShoulder, worldToUpperBody)

            // Calculate neck direction in upper body space
            const localEarCenter = localLeftEar.add(localRightEar).scale(0.5)
            const localShoulderCenter = localLeftShoulder.add(localRightShoulder).scale(0.5)
            const neckDirection = localEarCenter.subtract(localShoulderCenter).normalize()
            return Quaternion.FromUnitVectorsToRef(REF_NECK, neckDirection, new Quaternion());
        }
        return Quaternion.Identity()
    }
    calculateHeadRotation(mainBody: NormalizedLandmark[] | null,
        upperBodyRotation: Quaternion,
        neckRotation: Quaternion
    ): Quaternion {
        const worldLeftEar = this.getPoseKeyPoint(mainBody, "left_ear")
        const worldRightEar = this.getPoseKeyPoint(mainBody, "right_ear")
        const worldLeftEye = this.getPoseKeyPoint(mainBody, "left_eye")
        const worldRightEye = this.getPoseKeyPoint(mainBody, "right_eye")


        if (worldLeftEar && worldRightEar && worldLeftEye && worldRightEye) {
            const fullParentQuat = upperBodyRotation.multiply(neckRotation)
            const fullParentMatrix = new Matrix()
            Matrix.FromQuaternionToRef(fullParentQuat, fullParentMatrix)
            const worldToFullParent = fullParentMatrix.invert()

            const localLeftEar = Vector3.TransformCoordinates(worldLeftEar, worldToFullParent)
            const localRightEar = Vector3.TransformCoordinates(worldRightEar, worldToFullParent)
            const localLeftEye = Vector3.TransformCoordinates(worldLeftEye, worldToFullParent)
            const localRightEye = Vector3.TransformCoordinates(worldRightEye, worldToFullParent)

            const localEarCenter = localLeftEar.add(localRightEar).scale(0.5)
            const localEyeCenter = localLeftEye.add(localRightEye).scale(0.5)

            const earDirection = localLeftEar.subtract(localRightEar).normalize()
            const horizontalRotation = Quaternion.FromUnitVectorsToRef(REF_HORIZONTAL, earDirection, new Quaternion())

            const bendDirection = localEyeCenter.subtract(localEarCenter).normalize()
            const verticalRotation = Quaternion.FromUnitVectorsToRef(REF_VERTICAL_NEG_Z, bendDirection, new Quaternion())

            const combinedQuat = horizontalRotation.multiply(verticalRotation)

            return combinedQuat
        }
        return new Quaternion()
    }
    private calculateWristRotation(
        upperBodyRotation: Quaternion,
        shoulderRotation: Quaternion,
        elbowRotation: Quaternion,
        wristTwistRotation: Quaternion,
        hand_wrist: Vector3,
        middle_mcp: Vector3,
        isRight: boolean
    ): Quaternion {
        const fullParentQuat = upperBodyRotation.multiply(shoulderRotation).multiply(elbowRotation).multiply(wristTwistRotation)
        const fullParentMatrix = new Matrix()
        Matrix.FromQuaternionToRef(fullParentQuat, fullParentMatrix)
        const worldToFullParent = fullParentMatrix.invert()

        const localLeftWrist = Vector3.TransformCoordinates(hand_wrist, worldToFullParent)
        const localLeftMiddleMcp = Vector3.TransformCoordinates(middle_mcp, worldToFullParent)

        const wristDirection = localLeftMiddleMcp.subtract(localLeftWrist).normalize()
        const reference = !isRight ? REF_WRIST_LEFT : REF_WRIST_RIGHT
        return Quaternion.FromUnitVectorsToRef(reference, wristDirection, new Quaternion());

    }
    private calculateElbowRotation(
        upperBodyRotation: Quaternion,
        shoulderRotation: Quaternion,
        elbow: Vector3,
        wrist: Vector3,
        isRight: boolean
    ): Quaternion {

        const fullParentQuat = upperBodyRotation.multiply(shoulderRotation)
        const fullParentMatrix = new Matrix()
        Matrix.FromQuaternionToRef(fullParentQuat, fullParentMatrix)
        const worldToFullParent = fullParentMatrix.invert()

        const localLeftElbow = Vector3.TransformCoordinates(elbow, worldToFullParent)
        const localLeftWrist = Vector3.TransformCoordinates(wrist, worldToFullParent)

        const leftElbowDirection = localLeftWrist.subtract(localLeftElbow).normalize()
        const reference = !isRight ? REF_ELBOW_LEFT : REF_ELBOW_RIGHT
        return Quaternion.FromUnitVectorsToRef(reference, leftElbowDirection, new Quaternion())

    }
    private calculateLegRotation(
        mainBody: NormalizedLandmark[],
        hipLandmark: string,
        kneeLandmark: string,
        ankleLandmark: string,
        lowerBodyRot: Quaternion,
        now?: number,
    ): [Quaternion, Quaternion] {
        const hip = this.getKeyPoint(mainBody, hipLandmark, "pose");
        const knee = this.getKeyPoint(mainBody, kneeLandmark, "pose");
        const ankle = this.getKeyPoint(mainBody, ankleLandmark, "pose");
        const isRight = !hipLandmark.startsWith("left_")
        if (!hip || !knee || !ankle) {
            return [Quaternion.Identity(), Quaternion.Identity()];
        }

        // Улучшенная фильтрация с адаптивными параметрами
        const hipFilter = new OneEuroVectorFilter(0, Vector3.Zero(), Vector3.Zero(), 0.7, 0.15);
        const kneeFilter = new OneEuroVectorFilter(0, Vector3.Zero(), Vector3.Zero(), 0.7, 0.15);
        const ankleFilter = new OneEuroVectorFilter(0, Vector3.Zero(), Vector3.Zero(), 0.7, 0.15);

        const time = now ?? Date.now();
        const filteredHip = hipFilter.next(time, hip);
        const filteredKnee = kneeFilter.next(time, knee);
        const filteredAnkle = ankleFilter.next(time, ankle);
        const hipRotation = this.calculateHipRotation(lowerBodyRot, filteredHip, filteredKnee, isRight);
        const footRotation = this.calculateFootRotation(filteredHip, filteredAnkle, hipRotation, isRight);

        return [hipRotation, footRotation];
    }

    private calculateHipRotation(
        lowerBodyRot: Quaternion,
        hip: Vector3,
        knee: Vector3,
        isRight: boolean
    ): Quaternion {
        const lowerBodyMatrix = new Matrix()
        Matrix.FromQuaternionToRef(lowerBodyRot, lowerBodyMatrix)
        const worldToLowerBody = lowerBodyMatrix.invert()
        const localLeftHip = Vector3.TransformCoordinates(hip, worldToLowerBody)
        const localLeftKnee = Vector3.TransformCoordinates(knee, worldToLowerBody)
    const LegDirection = localLeftKnee.subtract(localLeftHip).normalize()
    return Quaternion.FromUnitVectorsToRef(REF_HIP_DIR, LegDirection, new Quaternion())
    }

    private calculateFootRotation(
        hip: Vector3,
        ankle: Vector3,
        hipRotation: Quaternion,
        isRight: boolean
    ): Quaternion {
        const footDir = ankle.subtract(hip).normalize();
        footDir.y *= -1;
        const hipRotationMatrix = new Matrix();
        Matrix.FromQuaternionToRef(hipRotation, hipRotationMatrix);
        const localFootDir = Vector3.TransformNormal(footDir, hipRotationMatrix.invert());
    const defaultDir = REF_DEFAULT_DIR;
        const angles = new Vector3();
        angles.y = Vector3.GetAngleBetweenVectors(
            new Vector3(localFootDir.x, 0, localFootDir.z),
            defaultDir,
            Vector3.Up()
        );
        angles.y = clamp(angles.y, HUMAN_LIMITS.KNEE_Y[0], HUMAN_LIMITS.KNEE_Y[1]);
        return Quaternion.RotationYawPitchRoll(0, angles.y, 0);
    }
    private calculateArmRotation(
        mainBody: NormalizedLandmark[],
        handKeypoints: NormalizedLandmark[],
        bodyRot: { upperBodyRot: Quaternion, lowerBodyRot: Quaternion },
        isRight: boolean,
        now: number
    ): [Quaternion, Quaternion, Quaternion, Quaternion] {

        const shoulderLandmark = isRight ? "right_shoulder" : "left_shoulder";
        const elbowLandmark = isRight ? "right_elbow" : "left_elbow";
        const wristLandmark = isRight ? "right_wrist" : "left_wrist";
        const shoulder = this.getPoseKeyPoint(mainBody, shoulderLandmark);
        const elbow = this.getPoseKeyPoint(mainBody, elbowLandmark);
        const wrist = this.getPoseKeyPoint(mainBody, wristLandmark);
        const hand_wrist = this.getHandKeyPoint(handKeypoints, wristLandmark);
        const index_mcp = this.getHandKeyPoint(handKeypoints, "index_mcp");
        const ring_mcp = this.getHandKeyPoint(handKeypoints, "ring_mcp");
        const middle_mcp = this.getHandKeyPoint(handKeypoints, "middle_mcp");
        var armFilter = new KalmanVectorFilter(0.1, 3);

        const filteredShoulder = armFilter.next(now, shoulder!);
        const filteredElbow = armFilter.next(now, elbow!);
        const filteredWrist = armFilter.next(now, wrist!);
        //const filteredHandWrist = armFilter.next(now, hand_wrist!);
        const shoulderRot = !shoulder || !elbow ? Quaternion.Identity() : this.calculateShoulderRotation(
            filteredShoulder,
            filteredElbow,
            bodyRot.upperBodyRot,
            isRight
        );
        const elbowRot = !elbow || !wrist ? Quaternion.Identity() : this.calculateElbowRotation(
            bodyRot.upperBodyRot,
            shoulderRot,
            filteredElbow,
            filteredWrist,
            isRight
        );
        const wristTwistRot = !hand_wrist || !index_mcp || !ring_mcp ? Quaternion.Identity() : this.calculateWristTwist(
            bodyRot.upperBodyRot,
            shoulderRot,
            elbowRot,
            index_mcp,
            ring_mcp
        )
        const wristRot = !hand_wrist || !middle_mcp ? Quaternion.Identity() : this.calculateWristRotation(
            bodyRot.upperBodyRot,
            shoulderRot,
            elbowRot,
            wristTwistRot,
            hand_wrist,
            middle_mcp,
            isRight
        )
        return [shoulderRot, elbowRot, wristTwistRot, wristRot];
    }
    calculateFingerRotation(
        rotations: {
            arms: [Quaternion, Quaternion, Quaternion, Quaternion],
            upperBody: Quaternion,
        },
        handKeypoints: NormalizedLandmark[],
        isRight: boolean,
    ): Record<string, Quaternion> {
        const {
            arms,
            upperBody
        } = rotations
        const result: Record<string, Quaternion> = {}
        const fingerData = getFingerBones(isRight);
        const refVectors = isRight ? RightRefFingersVector : LeftRefFingersVector
        const thumb_mcp = this.getHandKeyPoint(handKeypoints, "thumb_mcp");
        const thumb_ip = this.getHandKeyPoint(handKeypoints, "thumb_ip");
        const index_mcp = this.getHandKeyPoint(handKeypoints, "index_mcp");
        const index_pip = this.getHandKeyPoint(handKeypoints, "index_pip");
        const middle_mcp = this.getHandKeyPoint(handKeypoints, "middle_mcp");
        const middle_pip = this.getHandKeyPoint(handKeypoints, "middle_pip");
        const ring_mcp = this.getHandKeyPoint(handKeypoints, "ring_mcp");
        const ring_pip = this.getHandKeyPoint(handKeypoints, "ring_pip");
        const pinky_mcp = this.getHandKeyPoint(handKeypoints, "pinky_mcp");
        const pinky_pip = this.getHandKeyPoint(handKeypoints, "pinky_pip");
        const fullParentQuat = upperBody
            .multiply(arms[0])
            .multiply(arms[1])
            .multiply(arms[2])
            .multiply(arms[3])
        const fullParentMatrix = new Matrix()
        Matrix.FromQuaternionToRef(fullParentQuat, fullParentMatrix)
        const worldToFullParent = fullParentMatrix.invert()
        {
            if (!thumb_mcp || !thumb_ip) {
                result[fingerData[0]] = Quaternion.Identity();

            }
            else {
                const localThumbMCP = Vector3.TransformCoordinates(thumb_mcp, worldToFullParent)
                const localThumbIP = Vector3.TransformCoordinates(thumb_ip, worldToFullParent)
                const thumbDirection = localThumbIP.subtract(localThumbMCP).normalize()
                result[fingerData[0]] = Quaternion.FromUnitVectorsToRef(refVectors.Thumb1, thumbDirection, new Quaternion());

            }
            result[fingerData[1]] = this.calculateFingerJoint(result[fingerData[0]], isRight ? FINGER_THUMB_RIGHT : FINGER_THUMB_LEFT, 0.85)
        }
        {
            if (!index_mcp || !index_pip) {
                result[fingerData[2]] = Quaternion.Identity();
            } else {
                const localIndexMCP = Vector3.TransformCoordinates(index_mcp, worldToFullParent)
                const localIndexPIP = Vector3.TransformCoordinates(index_pip, worldToFullParent)
                const indexDirection = localIndexPIP.subtract(localIndexMCP).normalize()
                result[fingerData[2]] = Quaternion.FromUnitVectorsToRef(refVectors.Index1, indexDirection, new Quaternion());
            }
            result[fingerData[3]] = this.calculateFingerJoint(result[fingerData[2]], FINGER_INDEX_BEND, 0.9)
            result[fingerData[4]] = this.calculateFingerJoint(result[fingerData[2]], FINGER_INDEX_BEND, 0.65)
        }
        {
            if (!middle_mcp || !middle_pip) {
                result[fingerData[5]] = Quaternion.Identity();
            } else {
                const localMiddleMCP = Vector3.TransformCoordinates(middle_mcp, worldToFullParent)
                const localMiddlePIP = Vector3.TransformCoordinates(middle_pip, worldToFullParent)
                const middleDirection = localMiddlePIP.subtract(localMiddleMCP).normalize();
                result[fingerData[5]] = Quaternion.FromUnitVectorsToRef(refVectors.Middle1, middleDirection, new Quaternion())
            }
            result[fingerData[6]] = this.calculateFingerJoint(result[fingerData[5]], FINGER_MIDDLE_BEND, 0.9)
            result[fingerData[7]] = this.calculateFingerJoint(result[fingerData[5]], FINGER_MIDDLE_BEND, 0.65)
        }
        {
            if (!ring_mcp || !ring_pip) {
                result[fingerData[8]] = Quaternion.Identity();
            } else {
                const localRingMCP = Vector3.TransformCoordinates(ring_mcp, worldToFullParent)
                const localRingPIP = Vector3.TransformCoordinates(ring_pip, worldToFullParent)

                const ringDirection = localRingPIP.subtract(localRingMCP).normalize()
            }
        }
        {
            if (!pinky_mcp || !pinky_pip) {
                result[fingerData[11]] = Quaternion.Identity();
            } else {
                const localPinkyMCP = Vector3.TransformCoordinates(pinky_mcp, worldToFullParent)
                const localPinkyPIP = Vector3.TransformCoordinates(pinky_pip, worldToFullParent)

                const pinkyDirection = localPinkyPIP.subtract(localPinkyMCP).normalize()
                result[fingerData[11]] = Quaternion.FromUnitVectorsToRef(refVectors.Pinky1, pinkyDirection, new Quaternion());
            }
            result[fingerData[12]] = this.calculateFingerJoint(result[fingerData[11]], FINGER_PINKY_BEND, 0.85);
            result[fingerData[13]] = this.calculateFingerJoint(result[fingerData[11]], FINGER_PINKY_BEND, 0.55);
        }
        return result;
    }
    calculateFingerJoint(baseJointName: Quaternion, bendAxis: Vector3, ratio: number) {
        const bendDegrees = this.extractBendDegrees(baseJointName, bendAxis)
        const adjustedDegrees = bendDegrees * ratio

        // Create quaternion directly from degrees (following MPL approach)
        const radians = (adjustedDegrees * Math.PI) / 180
        const halfAngle = radians / 2
        const sin = Math.sin(halfAngle)
        const cos = Math.cos(halfAngle)

        const rotation = new Quaternion(bendAxis.x * sin, bendAxis.y * sin, bendAxis.z * sin, cos)
        return rotation;
    }
    private extractBendDegrees(quat: Quaternion, bendAxis: Vector3): number {
        // Extract the total rotation angle from quaternion in degrees
        const totalAngle = 2 * Math.acos(Math.abs(quat.w)) * (180 / Math.PI)

        // Determine the sign based on the bend axis component
        const axisComponent = quat.x * bendAxis.x + quat.y * bendAxis.y + quat.z * bendAxis.z
        const sign = axisComponent < 0 ? -1 : 1

        return totalAngle * sign
    }

    private calculateWristTwist(
        upperBodyRotation: Quaternion,
        shoulderRotation: Quaternion,
        elbowRotation: Quaternion,
        index_mcp: Vector3,
        ring_mcp: Vector3,
    ) {

        const fullParentQuat = upperBodyRotation.multiply(shoulderRotation).multiply(elbowRotation)
        const fullParentMatrix = new Matrix()
        Matrix.FromQuaternionToRef(fullParentQuat, fullParentMatrix)
        const worldToFullParent = fullParentMatrix.invert()

        const localRightIndex = Vector3.TransformCoordinates(index_mcp, worldToFullParent)
        const localRightRing = Vector3.TransformCoordinates(ring_mcp, worldToFullParent)

    const handDirection = localRightIndex.subtract(localRightRing).normalize()

    const fullRotation = Quaternion.FromUnitVectorsToRef(REF_VERTICAL_NEG_Z, handDirection, new Quaternion())

        const eulerAngles = fullRotation.toEulerAngles()
        const rollOnly = Quaternion.RotationYawPitchRoll(eulerAngles.z, 0, 0);
        return rollOnly;
    }
    private calculateShoulderRotation(
        shoulder: Vector3,
        elbow: Vector3,
        upperBodyRotation: Quaternion,
        isRight: boolean
    ): Quaternion {
        const upperBodyMatrix = new Matrix()
        Matrix.FromQuaternionToRef(upperBodyRotation, upperBodyMatrix)
        const worldToUpperBody = upperBodyMatrix.invert()

        const localShoulder = Vector3.TransformCoordinates(shoulder, worldToUpperBody)
        const localElbow = Vector3.TransformCoordinates(elbow, worldToUpperBody)

        const ArmDirection = localElbow.subtract(localShoulder).normalize()
        const reference = !isRight ? REF_SHOULDER_LEFT : REF_SHOULDER_RIGHT

        return Quaternion.FromUnitVectorsToRef(reference, ArmDirection, new Quaternion())

    }
    private calculateLowerBodyRotation(mainBody: NormalizedLandmark[], now: number): Quaternion {
        const leftVec = this.getPoseKeyPoint(mainBody, "left_hip");
        const rightVec = this.getPoseKeyPoint(mainBody, "right_hip");
        const leftHip = new OneEuroVectorFilter(0, Vector3.Zero(), Vector3.Zero(), 0.5, 0.1).next(now, leftVec!)
        const rightHip = new OneEuroVectorFilter(0, Vector3.Zero(), Vector3.Zero(), 0.5, 0.1).next(now, rightVec!)
        if (leftHip && rightHip) {
            const hipDirection = leftHip.subtract(rightHip).normalize()
            return Quaternion.FromUnitVectorsToRef(REF_HORIZONTAL, hipDirection, new Quaternion())
        }
        return Quaternion.Identity()
    }
    private updateEyeMovement(faceLandmarks: NormalizedLandmark[]): void {
        const leftEyeIris = this.getKeyPoint(faceLandmarks, "left_eye_iris", "face");
        const rightEyeIris = this.getKeyPoint(faceLandmarks, "right_eye_iris", "face");
        const leftEyeCenter = this.getKeyPoint(faceLandmarks, "left_eye", "face");
        const rightEyeCenter = this.getKeyPoint(faceLandmarks, "right_eye", "face");

        if (!leftEyeIris || !rightEyeIris || !leftEyeCenter || !rightEyeCenter) return;

        // Configuration
        const sensitivity = 0.3;
        const maxAngle = Math.PI / 9; // ~20 degrees

        // Process LEFT eye
        const leftOffset = leftEyeIris.subtract(leftEyeCenter);
        let leftYaw = -leftOffset.x * sensitivity;
        let leftPitch = -leftOffset.y * sensitivity;

        leftYaw = Math.max(-maxAngle, Math.min(maxAngle, leftYaw));
        leftPitch = Math.max(-maxAngle, Math.min(maxAngle, leftPitch));

        const leftRotation = Quaternion.RotationYawPitchRoll(leftYaw, leftPitch, 0);
        this.setRotation(MMDModelBones.LeftEye, leftRotation);  // Using "左目"

        // Process RIGHT eye  
        const rightOffset = rightEyeIris.subtract(rightEyeCenter);
        let rightYaw = -rightOffset.x * sensitivity;
        let rightPitch = -rightOffset.y * sensitivity;

        rightYaw = Math.max(-maxAngle, Math.min(maxAngle, rightYaw));
        rightPitch = Math.max(-maxAngle, Math.min(maxAngle, rightPitch));

        const rightRotation = Quaternion.RotationYawPitchRoll(rightYaw, rightPitch, 0);
        this.setRotation(MMDModelBones.RightEye, rightRotation);  // Using "右目"
    }
    calculateUpperBodyRotation(mainBody: NormalizedLandmark[], now?: number): Quaternion {
        const time = now ?? Date.now();
        const leftShoulder = this.getPoseKeyPoint(mainBody, "left_shoulder")
        const rightShoulder = this.getPoseKeyPoint(mainBody, "right_shoulder")

        if (leftShoulder && rightShoulder) {
            // use local temporary matrices/quaternions to avoid allocating every frame
            const filteredLeft = new KalmanVectorFilter(0.1, 3).next(time, leftShoulder);
            const filteredRight = new KalmanVectorFilter(0.1, 3).next(time, rightShoulder);
            const shoulderCenter = filteredLeft.add(filteredRight).scale(0.5)

            const shoulderX = filteredLeft.subtract(filteredRight).normalize()

            const spineY = shoulderCenter.normalize()

            const upperBodyZ = Vector3.Cross(shoulderX, spineY).normalize()

            const m = this._tmpMatrix1;
            // fill matrix values directly to avoid a new Matrix allocation
            m.copyFromFloats(
                shoulderX.x,
                shoulderX.y,
                shoulderX.z,
                0,
                spineY.x,
                spineY.y,
                spineY.z,
                0,
                upperBodyZ.x,
                upperBodyZ.y,
                upperBodyZ.z,
                0,
                0,
                0,
                0,
                1
            );

            const scaling = this._tmpVec;
            const rotation = this._tmpQuat;
            const translation = this._tmpVec2;
            m.decompose(scaling, rotation, translation)
        }
        return Quaternion.Identity()
    }
    moveFoot(side: "right" | "left", bodyLand: NormalizedLandmark[], scale: number = 10, yOffset: number = 7) {
        const ankle = this.getKeyPoint(bodyLand, `${side}_ankle`, "pose")
        const bone = this.searchBone(`${side === "right" ? "右" : "左"}足ＩＫ`)
        if (ankle && bone) {
            const targetPosition = new Vector3(ankle.x * scale, -ankle.y * scale + yOffset, ankle.z * scale)
            bone.position = Vector3.Lerp(bone.position, targetPosition, this.lerpFactor)
        }

    }

}