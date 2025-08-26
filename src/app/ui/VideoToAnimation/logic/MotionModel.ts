import { Matrix, Quaternion, Space, Vector3 } from "@babylonjs/core";
import { HolisticLandmarkerResult, NormalizedLandmark } from "@mediapipe/tasks-vision";
import { MmdWasmModel } from "babylon-mmd";
import { IMmdRuntimeLinkedBone } from "babylon-mmd/esm/Runtime/IMmdRuntimeLinkedBone";
import { BoneType, faceKeypoints, handKeypoints, HUMAN_LIMITS, KeyFrameType, MMDModelBones, poseKeypoints, VideosKeyFrameType } from "./MotionTypes";
import { KalmanVectorFilter, OneEuroVectorFilter } from "./Filters";
import * as Kalidokit from 'kalidokit'
import { clamp } from "kalidokit/dist/utils/helpers";
import { HolisticParser } from "./HolisticParser";

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

    constructor(private lerpFactor: number = 0.3) { }

    searchBone(name: string | MMDModelBones) {
        return this.boneMap.get(name);
    }
    init(Model: MmdWasmModel) {
        this._Model = Model;

        this._Model.skeleton.bones.forEach((el) => {
            this.boneMap.set(el.name, el);
        })
        console.log(this._Model)
        console.log(this.boneMap)
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
        let LowerBodyRotation: Quaternion | undefined = undefined;
        let HeadRotation: Quaternion | undefined = undefined;
        let leftArmRots: [Quaternion, Quaternion, Quaternion] | undefined = undefined;
        let rightArmRots: [Quaternion, Quaternion, Quaternion] | undefined = undefined;
        let leftLegRots: [Quaternion, Quaternion] | undefined = undefined;
        let rightLegRots: [Quaternion, Quaternion] | undefined = undefined;
        UpperBodyRotation = this.calculateUpperBodyRotation(parser.mainBody);
        LowerBodyRotation = this.calculateLowerBodyRotation(parser.mainBody, now);
        HeadRotation = this.calculateHeadRotation(parser.mainBody, UpperBodyRotation!);
        leftArmRots = this.calculateArmRotation(
            parser.mainBody,
            parser.leftWorldFingers,
            {
                upperBodyRot: UpperBodyRotation || Quaternion.Identity(),
                lowerBodyRot: LowerBodyRotation || Quaternion.Identity(),
            },
            "left_shoulder",
            "left_elbow",
            "left_wrist",
            false,
            now
        );
        rightArmRots = this.calculateArmRotation(
            parser.mainBody,
            parser.rightWorldFingers,
            {
                upperBodyRot: UpperBodyRotation || Quaternion.Identity(),
                lowerBodyRot: LowerBodyRotation || Quaternion.Identity(),
            },
            "right_shoulder",
            "right_elbow",
            "right_wrist",
            true,
            now
        );

        leftLegRots = this.calculateLegRotation(
            parser.mainBody,
            "left_hip",
            "left_knee",
            "left_ankle",
            LowerBodyRotation || Quaternion.Identity(),
            now
        );
        rightLegRots = this.calculateLegRotation(
            parser.mainBody,
            "right_hip",
            "right_knee",
            "right_ankle",
            LowerBodyRotation || Quaternion.Identity(),
            now
        );


        this.moveBody(parser.poseLandmarks, now);
        if (LowerBodyRotation) this.setRotation(MMDModelBones.LowerBody, LowerBodyRotation);
        if (UpperBodyRotation) this.setRotation(MMDModelBones.UpperBody, UpperBodyRotation);

        if (leftArmRots && rightArmRots) {
            this.setRotation(MMDModelBones.RightArm, rightArmRots[0]);
            this.setRotation(MMDModelBones.LeftArm, leftArmRots[0]);
            this.setRotation(MMDModelBones.RightElbow, rightArmRots[1]);
            this.setRotation(MMDModelBones.LeftElbow, leftArmRots[1]);
            this.setRotation(MMDModelBones.RightWrist, rightArmRots[2]);
            this.setRotation(MMDModelBones.LeftWrist, leftArmRots[2]);
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
        this.rotateFingers(parser.leftWorldFingers, "left");
        this.rotateFingers(parser.rightWorldFingers, "right");
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
        const hipLeft3D = this.getKeyPoint(bodyLand, "left_hip", "pose");
        const hipRight3D = this.getKeyPoint(bodyLand, "right_hip", "pose");
        const shoulderLeft3D = this.getKeyPoint(bodyLand, "left_shoulder", "pose");
        const shoulderRight3D = this.getKeyPoint(bodyLand, "right_shoulder", "pose");

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
    calculateFacialExpressions(faceLandmarks: NormalizedLandmark[]): { [key: string]: number } {
        const get = (name: string) => this.getKeyPoint(faceLandmarks, name, "face");

        const leftEyeUpper = get("left_eye_upper");
        const leftEyeLower = get("left_eye_lower");
        const rightEyeUpper = get("right_eye_upper");
        const rightEyeLower = get("right_eye_lower");

        const upperLipTop = get("upper_lip_top");
        const lowerLipBottom = get("lower_lip_bottom");
        const mouthLeft = get("mouth_left");
        const mouthRight = get("mouth_right");
        const upperLipCenter = get("upper_lip_center");
        const lowerLipCenter = get("lower_lip_center");
        const leftCorner = get("left_corner");
        const rightCorner = get("right_corner");

        const leftBrow = leftEyeUpper;
        const rightBrow = rightEyeUpper;

        const leftEar = get("left_ear");
        const rightEar = get("right_ear");

        let leftBlink = 0, rightBlink = 0;
        if (leftEyeUpper && leftEyeLower && rightEyeUpper && rightEyeLower) {
            const leftEyeDistance = Vector3.Distance(leftEyeUpper, leftEyeLower);
            const rightEyeDistance = Vector3.Distance(rightEyeUpper, rightEyeLower);

            const adaptiveThreshold = 0.012;
            leftBlink = Math.min(Math.max(1 - (leftEyeDistance - adaptiveThreshold) * 16, 0), 1);
            rightBlink = Math.min(Math.max(1 - (rightEyeDistance - adaptiveThreshold) * 16, 0), 1);

            if (leftEyeDistance < 0.008) leftBlink = 0;
            if (rightEyeDistance < 0.008) rightBlink = 0;
        }


        let mouthOpenness = 0, mouthWidth = 0, mouthSmile = 0, mouthSurprise = 0;
        if (upperLipTop && lowerLipBottom && mouthLeft && mouthRight && upperLipCenter && lowerLipCenter && leftCorner && rightCorner && leftEar && rightEar) {
            const mouthHeight = Vector3.Distance(upperLipTop, lowerLipBottom);
            const mouthWidthVal = Vector3.Distance(mouthLeft, mouthRight);
            const faceWidth = Vector3.Distance(leftEar, rightEar);
            mouthOpenness = Math.min(Math.max((mouthHeight / mouthWidthVal - 0.1) / 0.5, 0), 1);
            mouthWidth = Math.min(Math.max((mouthWidthVal / faceWidth - 0.45) / 0.1, -1), 1);
            const mouthCenter = Vector3.Center(upperLipCenter, lowerLipCenter);
            const leftLift = Vector3.Distance(leftCorner, mouthCenter);
            const rightLift = Vector3.Distance(rightCorner, mouthCenter);
            const averageLift = (leftLift + rightLift) / 2;
            mouthSmile = Math.min(Math.max((averageLift - mouthWidthVal * 0.3) / (mouthWidthVal * 0.2), -1), 1);
            mouthSurprise = Math.max(0, mouthOpenness - 0.5) * (1 - Math.abs(mouthWidth));
        }

        // --- Брови ---
        let browHeight = 0.5;
        if (leftBrow && rightBrow) {
            browHeight = (leftBrow.y + rightBrow.y) / 2;
        }

        // --- Эмоции ---
        // Удивление: рот широко открыт, брови подняты
        const surprise = Math.max(0, mouthSurprise * 1.2 + (browHeight - 0.6) * 2);
        // Отвращение: рот сжат, брови опущены
        const disgust = Math.max(0, -mouthOpenness * 0.5 + (0.5 - browHeight) * 2);
        // Страх: рот приоткрыт, брови подняты, глаза широко
        const fear = Math.max(0, (mouthOpenness * 0.5 + (browHeight - 0.6) * 1.5 + (1 - leftBlink) * 0.5));
        // Скука: рот почти закрыт, брови нейтральны
        const boredom = Math.max(0, (0.2 - mouthOpenness) * 2 + Math.abs(browHeight - 0.5));
        // Улыбка с зубами: рот открыт и улыбка
        const smileTeeth = Math.max(0, mouthSmile * mouthOpenness * 1.2);

        // --- Итоговые морфы ---
        return {
            // Базовые морфы рта
            "あ": Math.pow(mouthOpenness, 1.5),
            "い": Math.max(0, -mouthWidth) * 0.7,
            "う": Math.max(0, mouthWidth) * 0.7,
            "お": Math.max(0, mouthOpenness - 0.3) * 1.5,
            // Эмоции
            "笑い": Math.max(0, mouthSmile) * Math.min(mouthOpenness, 1) * 0.8,
            "笑い歯": smileTeeth,
            "驚き": surprise,
            "嫌悪": disgust,
            "恐怖": fear,
            "退屈": boredom,
            // Глаза
            "まばたき": leftBlink,
            "まばたき右": rightBlink,
            // Брови
            "困る": Math.max(0, browHeight - 0.6) * 2.0,
            "怒り": Math.max(0, 0.5 - browHeight) * 2.0
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
    private _fingerPrevAngles: { [key: string]: number } = {};
    rotateFingers(hand: NormalizedLandmark[] | null, side: "left" | "right"): void {
        if (!hand || hand.length === 0) return;

        const fingerNames = ["親指", "人指", "中指", "薬指", "小指"];
        const fingerJoints = ["", "１", "２", "３"];
        const fingerBaseIndices = [1, 5, 9, 13, 17]; // Base indices for each finger
        // Anatomical joint limits (in radians)
        const jointLimits = [
            [Math.PI / 2, Math.PI / 2, Math.PI / 2, Math.PI * 70 / 180], // Thumb (last joint 70°)
            [Math.PI / 2, Math.PI / 2, Math.PI / 2, Math.PI * 70 / 180], // Index
            [Math.PI / 2, Math.PI / 2, Math.PI / 2, Math.PI * 70 / 180], // Middle
            [Math.PI / 2, Math.PI / 2, Math.PI / 2, Math.PI * 70 / 180], // Ring
            [Math.PI / 2, Math.PI / 2, Math.PI / 2, Math.PI * 70 / 180], // Little
        ];
        const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
        const smoothFactor = 0.5; // 0.0 = no smoothing, 1.0 = full smoothing

        fingerNames.forEach((fingerName, fingerIndex) => {
            let prevAngle = 0;
            fingerJoints.forEach((joint, jointIndex) => {
                const boneName = `${side === "left" ? "左" : "右"}${fingerName}${joint}`;
                const bone = this.searchBone(boneName);
                if (!bone) return;

                const baseIndex = fingerBaseIndices[fingerIndex];
                const currentIndex = baseIndex + jointIndex;
                const nextIndex = baseIndex + jointIndex + 1;
                if (nextIndex >= hand.length) return;

                let angle = 0;
                if (jointIndex === 3) {
                    // Distal phalanx: follow 2/3 of previous joint's angle
                    angle = prevAngle * 2 / 3;
                } else {
                    const currentPoint = new Vector3(hand[currentIndex].x, hand[currentIndex].y, hand[currentIndex].z);
                    const nextPoint = new Vector3(hand[nextIndex].x, hand[nextIndex].y, hand[nextIndex].z);
                    const segmentVector = nextPoint.subtract(currentPoint).normalize();
                    const defaultVector = new Vector3(0, -1, 0);
                    let rawAngle = Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(defaultVector, segmentVector))));
                    const cross = Vector3.Cross(defaultVector, segmentVector);
                    let sign = Math.sign(cross.z);
                    if (side === "left") sign *= -1;
                    angle = rawAngle * sign;
                }
                // Clamp to anatomical limits
                const minAngle = 0;
                const maxAngle = jointLimits[fingerIndex][jointIndex];
                if (angle < minAngle) angle = 0;
                if (angle > maxAngle) angle = maxAngle;
                // Smoothing
                const prevKey = `${side}_${fingerName}_${joint}`;
                if (this._fingerPrevAngles[prevKey] === undefined) this._fingerPrevAngles[prevKey] = angle;
                angle = lerp(this._fingerPrevAngles[prevKey], angle, smoothFactor);
                this._fingerPrevAngles[prevKey] = angle;
                if (jointIndex !== 3) prevAngle = angle;
                // Apply as a simple rotation around the Z axis
                const rotation = new Vector3(0, 0, angle);
                bone.setRotationQuaternion(
                    Quaternion.Slerp(
                        bone.rotationQuaternion || new Quaternion(),
                        Quaternion.FromEulerAngles(rotation.x, rotation.y, rotation.z),
                        this.lerpFactor
                    ),
                    Space.LOCAL
                );
            });
        });
    }


    calculateHeadRotation(mainBody: NormalizedLandmark[] | null, upperBodyRotation: Quaternion): Quaternion {
        const nose = this.getKeyPoint(mainBody, "nose", "face")
        const leftShoulder = this.getKeyPoint(mainBody, "left_shoulder", "pose")
        const rightShoulder = this.getKeyPoint(mainBody, "right_shoulder", "pose")


        if (nose && leftShoulder && rightShoulder) {
            const neckPos = leftShoulder.add(rightShoulder).scale(0.5)
            const headDir = nose.subtract(neckPos).normalize()

            const upperBodyRotationMatrix = new Matrix()
            Matrix.FromQuaternionToRef(upperBodyRotation, upperBodyRotationMatrix)

            const localHeadDir = Vector3.TransformNormal(headDir, upperBodyRotationMatrix.invert())

            const forwardDir = new Vector3(localHeadDir.x, 0, localHeadDir.z).normalize()

            const tiltAngle = Math.atan2(-localHeadDir.y, forwardDir.length())

            const tiltOffset = -Math.PI / 9
            const adjustedTiltAngle = tiltAngle + tiltOffset

            const horizontalQuat = Quaternion.FromLookDirectionLH(forwardDir, Vector3.Up())

            const tiltQuat = Quaternion.RotationAxis(Vector3.Right(), adjustedTiltAngle)

            const combinedQuat = horizontalQuat.multiply(tiltQuat)
            return combinedQuat
        }
        return new Quaternion()
    }
    private calculateWristRotation(
        wrist: Vector3,
        pinkyFinger: Vector3,
        lowerArmRotation: Quaternion,
        isRight: boolean
    ): Quaternion {
        const wristDir = pinkyFinger.subtract(wrist).normalize()
        wristDir.y *= -1
        const lowerArmRotationMatrix = new Matrix()
        Matrix.FromQuaternionToRef(lowerArmRotation, lowerArmRotationMatrix)
        const localWristDir = Vector3.TransformNormal(wristDir, lowerArmRotationMatrix.invert())
        const defaultDir = new Vector3(!isRight ? 1 : -1, -1, 0).normalize()
        let baseQuat = Quaternion.FromUnitVectorsToRef(defaultDir, localWristDir, new Quaternion())
        // Дополнительный разворот кисти наружу
        const outwardAngle = (isRight ? -1 : 1) * (Math.PI / 4); // 45 градусов, противоположное направление
        const outwardAxis = new Vector3(0, 0, 1); // Z — наружу для кисти
        const outwardQuat = Quaternion.RotationAxis(outwardAxis, outwardAngle);
        return outwardQuat.multiply(baseQuat).normalize();
    }
    private calculateElbowRotation(
        upperBodyRotation: Quaternion,
        elbow: Vector3,
        wrist: Vector3,
        isRight: boolean
    ): Quaternion {

        const lowerArmDir = wrist.subtract(elbow).normalize()
        lowerArmDir.y *= -1

        const upperArmRotationMatrix = new Matrix()
        Matrix.FromQuaternionToRef(upperBodyRotation, upperArmRotationMatrix)

        const localLowerArmDir = Vector3.TransformNormal(lowerArmDir, upperArmRotationMatrix.invert())

        const defaultDir = new Vector3(!isRight ? 1 : -1, -1, 0).normalize()

        const rotationQuaternion = Quaternion.FromUnitVectorsToRef(defaultDir, localLowerArmDir, new Quaternion())

        return rotationQuaternion

    }
    private calculateLegRotation(
        mainBody: NormalizedLandmark[],
        hipLandmark: string,
        kneeLandmark: string,
        ankleLandmark: string,
        lowerBodyRot: Quaternion,
        now?: number // make now optional
    ): [Quaternion, Quaternion] {
        const hip = this.getKeyPoint(mainBody, hipLandmark, "pose");
        const knee = this.getKeyPoint(mainBody, kneeLandmark, "pose");
        const ankle = this.getKeyPoint(mainBody, ankleLandmark, "pose");

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
        const hipRotation = this.calculateHipRotation(lowerBodyRot, filteredHip, filteredKnee);
        const footRotation = this.calculateFootRotation(filteredHip, filteredAnkle, hipRotation);

        return [hipRotation, footRotation];
    }

    private calculateHipRotation(
        lowerBodyRot: Quaternion,
        hip: Vector3,
        knee: Vector3
    ): Quaternion {
        // Направление ноги
        const legDir = knee.subtract(hip).normalize();
        legDir.y *= -1;

        // Преобразование в локальные координаты
        const lowerBodyRotationMatrix = new Matrix();
        Matrix.FromQuaternionToRef(lowerBodyRot, lowerBodyRotationMatrix);
        const localLegDir = Vector3.TransformNormal(legDir, lowerBodyRotationMatrix.invert());
        // Вычисление углов Эйлера
        const angles = new Vector3();
        // Угол сгибания бедра вперед/назад (X)
        angles.x = Vector3.GetAngleBetweenVectors(
            new Vector3(localLegDir.x, 0, localLegDir.z),
            new Vector3(0, 0, 1),
            Vector3.Up()
        );
        angles.x = clamp(angles.x, HUMAN_LIMITS.HIP_X[0], HUMAN_LIMITS.HIP_X[1]);

        // Угол отведения бедра в сторону (Y)
        angles.y = Math.atan2(localLegDir.x, localLegDir.z);
        angles.y = clamp(angles.y, HUMAN_LIMITS.HIP_Y[0], HUMAN_LIMITS.HIP_Y[1]);

        // Угол вращения бедра внутрь/наружу (Z)
        angles.z = Math.atan2(localLegDir.y, Math.sqrt(localLegDir.x * localLegDir.x + localLegDir.z * localLegDir.z));
        angles.z = clamp(angles.z, HUMAN_LIMITS.HIP_Z[0], HUMAN_LIMITS.HIP_Z[1]);

        // Создание кватерниона из углов Эйлера
        return Quaternion.RotationYawPitchRoll(angles.y, angles.x, angles.z);
    }

    private calculateFootRotation(
        hip: Vector3,
        ankle: Vector3,
        hipRotation: Quaternion
    ): Quaternion {
        const footDir = ankle.subtract(hip).normalize();
        footDir.y *= -1;
        const hipRotationMatrix = new Matrix();
        Matrix.FromQuaternionToRef(hipRotation, hipRotationMatrix);
        const localFootDir = Vector3.TransformNormal(footDir, hipRotationMatrix.invert());
        const defaultDir = new Vector3(0, 0, 1);
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
        shoulderLandmark: string,
        elbowLandmark: string,
        wristLandmark: string,
        isRight: boolean,
        now: number
    ): [Quaternion, Quaternion, Quaternion] {
        const shoulder = this.getKeyPoint(mainBody, shoulderLandmark, "pose");
        const elbow = this.getKeyPoint(mainBody, elbowLandmark, "pose");
        const wrist = this.getKeyPoint(mainBody, wristLandmark, "pose");
        const fingerhand = this.getKeyPoint(handKeypoints, "thumb_mcp", "hand");
        var armFilter = new KalmanVectorFilter(0.1, 3);

        const filteredShoulder = armFilter.next(now, shoulder!);
        const filteredElbow = armFilter.next(now, elbow!);
        const filteredWrist = armFilter.next(now, wrist!);
        const shoulderRot = !shoulder || !elbow ? new Quaternion() : this.calculateShoulderRotation(
            filteredShoulder,
            filteredElbow,
            bodyRot.upperBodyRot,
            isRight
        );
        const elbowRot = !elbow || !wrist ? new Quaternion() : this.calculateElbowRotation(
            bodyRot.upperBodyRot,
            filteredElbow,
            filteredWrist,
            isRight
        );
        const wristRot = !wrist || !fingerhand ? new Quaternion() : this.calculateWristRotation(
            filteredWrist,
            fingerhand,
            bodyRot.lowerBodyRot,
            isRight
        )
        return [shoulderRot, elbowRot, wristRot];
    }
    private calculateShoulderRotation(
        shoulder: Vector3,
        elbow: Vector3,
        upperBodyRotation: Quaternion,
        isRight: boolean
    ): Quaternion {
        const armDir = elbow.subtract(shoulder).normalize()
        armDir.y *= -1;
        const upperBodyRotationMatrix = new Matrix()
        Matrix.FromQuaternionToRef(upperBodyRotation, upperBodyRotationMatrix)

        const localArmDir = Vector3.TransformNormal(armDir, upperBodyRotationMatrix.invert())

        const defaultDir = new Vector3(!isRight ? 1 : -1, -1, 0).normalize()

        const rotationQuaternion = Quaternion.FromUnitVectorsToRef(defaultDir, localArmDir, new Quaternion())

        return rotationQuaternion

    }
    private calculateLowerBodyRotation(mainBody: NormalizedLandmark[], now: number): Quaternion {
        const leftVec = this.getKeyPoint(mainBody, "left_hip", "pose");
        const rightVec = this.getKeyPoint(mainBody, "right_hip", "pose");
        const leftHip = new OneEuroVectorFilter(0, Vector3.Zero(), Vector3.Zero(), 0.5, 0.1).next(now, leftVec!)
        const rightHip = new OneEuroVectorFilter(0, Vector3.Zero(), Vector3.Zero(), 0.5, 0.1).next(now, rightVec!)
        if (leftHip && rightHip) {
            const hipDir = leftHip.subtract(rightHip).normalize()
            hipDir.y *= -1
            const defaultDir = new Vector3(1, 0, 0)
            const hipRotation = Quaternion.FromUnitVectorsToRef(defaultDir, hipDir, new Quaternion())
            return hipRotation
        }
        return new Quaternion()
    }
    private updateEyeMovement(faceLandmarks: NormalizedLandmark[]): void {
        const leftEyeIris = this.getKeyPoint(faceLandmarks, "left_eye_iris", "face");
        const rightEyeIris = this.getKeyPoint(faceLandmarks, "right_eye_iris", "face");
        const leftEyeCenter = this.getKeyPoint(faceLandmarks, "left_eye", "face");
        const rightEyeCenter = this.getKeyPoint(faceLandmarks, "right_eye", "face");

        if (!leftEyeIris || !rightEyeIris || !leftEyeCenter || !rightEyeCenter) return;

        // Обработка левого глаза
        const leftDirection = leftEyeIris.subtract(leftEyeCenter).normalize();
        const leftRotation = Quaternion.RotationYawPitchRoll(
            leftDirection.x * 0.5,
            leftDirection.y * 0.5,
            0
        );
        this.setRotation(MMDModelBones.LeftEye, leftRotation);

        // Обработка правого глаза
        const rightDirection = rightEyeIris.subtract(rightEyeCenter).normalize();
        const rightRotation = Quaternion.RotationYawPitchRoll(
            rightDirection.x * 0.5,
            rightDirection.y * 0.5,
            0
        );
        this.setRotation(MMDModelBones.RightEye, rightRotation);
    }
    calculateUpperBodyRotation(mainBody: NormalizedLandmark[]): Quaternion {
        const leftShoulder = this.getKeyPoint(mainBody, "left_shoulder", "pose")
        const rightShoulder = this.getKeyPoint(mainBody, "right_shoulder", "pose")

        if (leftShoulder && rightShoulder) {
            const filteredLeft = new KalmanVectorFilter(0.1, 3).next(Date.now(), leftShoulder!);
            const filteredRight = new KalmanVectorFilter(0.1, 3).next(Date.now(), rightShoulder!);
            const spineDir = filteredLeft.subtract(filteredRight).normalize()
            spineDir.y *= -1
            const defaultDir = new Vector3(1, 0, 0)

            // Calculate rotation from default to spine direction
            const spineRotation = Quaternion.FromUnitVectorsToRef(defaultDir, spineDir, new Quaternion())

            // Calculate bend
            const shoulderCenter = Vector3.Center(filteredLeft, filteredRight)
            const hipCenter = new Vector3(0, 0, 0)
            const bendDir = shoulderCenter.subtract(hipCenter).normalize()
            bendDir.y *= -1
            const bendAngle = Math.acos(Vector3.Dot(bendDir, Vector3.Up()))
            const bendAxis = Vector3.Cross(Vector3.Up(), bendDir).normalize()
            const bendRotation = Quaternion.RotationAxis(bendAxis, bendAngle)

            // Combine spine rotation and bend
            return spineRotation.multiply(bendRotation)
        }
        return new Quaternion()
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
