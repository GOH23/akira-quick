import { MmdWasmModel } from "babylon-mmd";
import Encoding from "encoding-japanese";
import { KeyFrameType, MMDModelBones } from "./MotionTypes";
import { Quaternion, Vector3 } from "@babylonjs/core";
import { IMmdRuntimeLinkedBone } from "babylon-mmd/esm/Runtime/IMmdRuntimeLinkedBone";
export class ExportAnimation {
    static exportToVMD(_Model: MmdWasmModel, keyframes: KeyFrameType[]): Blob {
        if (!_Model || keyframes.length === 0) {
            throw new Error("Модель не инициализирована или нет кадров анимации");
        }

        function encodeShiftJIS(str: string): Uint8Array {
            const unicodeArray = Encoding.stringToCode(str)
            const sjisArray = Encoding.convert(unicodeArray, {
                to: "SJIS",
                from: "UNICODE",
            })
            return new Uint8Array(sjisArray)
        }

        // Функция для сравнения двух кадров
        const areFramesSimilar = (frame1: any, frame2: any, threshold: number = 0.003): boolean => {
            // Сравниваем позиции костей
            for (let i = 0; i < frame1.boneFrames.length; i++) {
                const pos1 = frame1.boneFrames[i].position;
                const pos2 = frame2.boneFrames[i].position;

                if (Math.abs(pos1.x - pos2.x) > threshold ||
                    Math.abs(pos1.y - pos2.y) > threshold ||
                    Math.abs(pos1.z - pos2.z) > threshold) {
                    return false;
                }

                // Сравниваем вращения (кватернионы)
                const rot1 = frame1.boneFrames[i].rotation;
                const rot2 = frame2.boneFrames[i].rotation;

                if (Math.abs(rot1.x - rot2.x) > threshold ||
                    Math.abs(rot1.y - rot2.y) > threshold ||
                    Math.abs(rot1.z - rot2.z) > threshold ||
                    Math.abs(rot1.w - rot2.w) > threshold) {
                    return false;
                }
            }

            // Сравниваем морфы
            for (let i = 0; i < frame1.morphFrames.length; i++) {
                if (Math.abs(frame1.morphFrames[i].weight - frame2.morphFrames[i].weight) > threshold * 10) {
                    return false;
                }
            }

            return true;
        };

        // Фильтрация кадров - удаление похожих кадров
        const filterSimilarFrames = (frames: any[]): any[] => {
            if (frames.length <= 1) return frames;

            const filteredFrames = [frames[0]];
            let lastFrame = frames[0];

            for (let i = 1; i < frames.length; i++) {
                if (!areFramesSimilar(lastFrame, frames[i])) {
                    filteredFrames.push(frames[i]);
                    lastFrame = frames[i];
                }
            }

            console.log(`Фильтрация: ${frames.length} -> ${filteredFrames.length} кадров`);
            return filteredFrames;
        };

        const writeBoneFrame = (
            dataView: DataView,
            offset: number,
            name: string,
            frame: number,
            position: Vector3,
            rotation: Quaternion
        ): number => {
            const nameBytes = encodeShiftJIS(name);
            for (let i = 0; i < 15; i++) {
                dataView.setUint8(offset + i, i < nameBytes.length ? nameBytes[i] : 0);
            }
            offset += 15;

            dataView.setUint32(offset, frame, true);
            offset += 4;

            dataView.setFloat32(offset, position.x, true);
            offset += 4;
            dataView.setFloat32(offset, position.y, true);
            offset += 4;
            dataView.setFloat32(offset, position.z, true);
            offset += 4;

            dataView.setFloat32(offset, rotation.x, true);
            offset += 4;
            dataView.setFloat32(offset, rotation.y, true);
            offset += 4;
            dataView.setFloat32(offset, rotation.z, true);
            offset += 4;
            dataView.setFloat32(offset, rotation.w, true);
            offset += 4;

            // Интерполяционные параметры (64 байта)
            for (let i = 0; i < 64; i++) {
                dataView.setUint8(offset + i, 20);
            }
            offset += 64;

            return offset;
        };

        const writeMorphFrame = (
            dataView: DataView,
            offset: number,
            name: string,
            frame: number,
            weight: number
        ): number => {
            const nameBytes = encodeShiftJIS(name);
            for (let i = 0; i < 15; i++) {
                dataView.setUint8(offset + i, i < nameBytes.length ? nameBytes[i] : 0);
            }
            offset += 15;

            dataView.setUint32(offset, frame, true);
            offset += 4;

            dataView.setFloat32(offset, weight, true);
            offset += 4;

            return offset;
        };

        // Собираем данные из keyframes
        const frames = keyframes.map(keyframe => {
            const boneFrames = keyframe.keyData.map(data => {
                // Применяем правильное масштабирование для ног
                const heightScale = 1.0;

                // Только для корневой кости, IK ног и рук сохраняем позицию
                if (data.boneName === MMDModelBones.RootBone ||
                    data.boneName === MMDModelBones.LeftFootIK ||
                    data.boneName === MMDModelBones.RightFootIK ||
                    data.boneName === MMDModelBones.LeftArm ||
                    data.boneName === MMDModelBones.RightArm) {
                    return {
                        name: data.boneName,
                        // Для ног используем специальное масштабирование по Y
                        position: new Vector3(
                            data.position[0],
                            data.boneName === MMDModelBones.RootBone ?
                                data.position[1] * heightScale :
                                data.position[1],
                            data.position[2]
                        ),
                        rotation: new Quaternion(
                            data.quaternion[0] || 0,
                            data.quaternion[1] || 0,
                            data.quaternion[2] || 0,
                            data.quaternion[3] || 1
                        )
                    };
                }

                // Для остальных костей не используем позицию (только вращение)
                return {
                    name: data.boneName,
                    position: new Vector3(0, 0, 0),
                    rotation: new Quaternion(
                        data.quaternion[0] || 0,
                        data.quaternion[1] || 0,
                        data.quaternion[2] || 0,
                        data.quaternion[3] || 1
                    )
                };
            });
            return { boneFrames, morphFrames: keyframe.morphData };
        });

        // Применяем несколько этапов фильтрации для сильного уменьшения количества кадров

        // 1. Сначала пробуем сэмплировать кадры с шагом (брать каждый N-ный кадр)
        const samplingStep = Math.max(1, Math.floor(frames.length / 3000));
        const sampledFrames = frames.filter((_, index) => index % samplingStep === 0);

        // 2. Затем удаляем похожие кадры для дальнейшего уменьшения
        const filteredFrames = filterSimilarFrames(sampledFrames);

        // Убедимся, что первый и последний кадры всегда включены
        if (frames.length > 1 && filteredFrames.length > 1) {
            if (!areFramesSimilar(filteredFrames[filteredFrames.length - 1], frames[frames.length - 1])) {
                filteredFrames.push(frames[frames.length - 1]);
            }
        }

        const frameCount = filteredFrames.length;
        const boneCnt = filteredFrames[0].boneFrames.length;
        const morphCnt = filteredFrames[0].morphFrames.length;
        const headerSize = 30 + 20;
        const boneFrameSize = 15 + 4 + 12 + 16 + 64;
        const morphFrameSize = 15 + 4 + 4;
        const totalSize =
            headerSize + 4 + boneFrameSize * frameCount * boneCnt + 4 + morphFrameSize * frameCount * morphCnt + 4 + 4 + 4;

        const buffer = new ArrayBuffer(totalSize);
        const dataView = new DataView(buffer);
        let offset = 0;

        // Записываем заголовок
        const header = "Vocaloid Motion Data 0002";
        for (let i = 0; i < 30; i++) {
            dataView.setUint8(offset + i, i < header.length ? header.charCodeAt(i) : 0);
        }
        offset += 30;

        // Записываем название модели (пустое в данном случае)
        offset += 20;

        // Записываем количество кадров костей
        dataView.setUint32(offset, frameCount * boneCnt, true);
        offset += 4;

        // Генерируем кадры костей
        for (let i = 0; i < frameCount; i++) {
            for (const boneFrame of filteredFrames[i].boneFrames) {
                offset = writeBoneFrame(
                    dataView,
                    offset,
                    boneFrame.name,
                    i,
                    boneFrame.position,
                    boneFrame.rotation
                );
            }
        }

        // Записываем количество кадров морфов
        dataView.setUint32(offset, frameCount * morphCnt, true);
        offset += 4;

        // Генерируем кадры морфов
        for (let i = 0; i < frameCount; i++) {
            for (const morphFrame of filteredFrames[i].morphFrames) {
                offset = writeMorphFrame(
                    dataView,
                    offset,
                    morphFrame.name,
                    i,
                    morphFrame.weight
                );
            }
        }


        dataView.setUint32(offset, 0, true);
        offset += 4;
        dataView.setUint32(offset, 0, true);
        dataView.setUint32(offset, 0, true);
        offset += 4;

        return new Blob([buffer], { type: "application/octet-stream" });
    }
    exportToGLTF(fileName: string = "akira_animation.gltf", _Model: MmdWasmModel, keyframes: KeyFrameType[], searchBone: (name: string | MMDModelBones) => IMmdRuntimeLinkedBone | undefined, boneMap: Map<string, IMmdRuntimeLinkedBone>): Blob {
        if (!_Model || keyframes.length === 0) {
            throw new Error("Модель не инициализирована или нет кадров анимации");
        }

        // Подготовка данных для буферов
        const buffers: { data: Uint8Array, byteOffset: number }[] = [];
        let totalBufferSize = 0;

        // Вспомогательная функция для добавления данных в буфер с выравниванием по 4 байта
        const addToBuffer = (data: Uint8Array): number => {
            const byteOffset = totalBufferSize;

            // Добавляем данные
            buffers.push({ data, byteOffset });
            totalBufferSize += data.byteLength;

            // Выравнивание по 4 байта
            const padding = (4 - (totalBufferSize % 4)) % 4;
            if (padding > 0) {
                buffers.push({ data: new Uint8Array(padding), byteOffset: totalBufferSize });
                totalBufferSize += padding;
            }

            return byteOffset;
        };

        // Создаем базовую структуру glTF
        const gltf: any = {
            asset: {
                version: "2.0",
                generator: "Akira Motion Exporter",
                copyright: "Akira Motion Capture"
            },
            scene: 0,
            scenes: [{
                nodes: [0]
            }],
            nodes: [{
                name: "AkiraRoot",
                children: [1]
            }],
            meshes: [],
            animations: [],
            skins: [],
            accessors: [],
            bufferViews: [],
            buffers: [{
                byteLength: 0,
                uri: "data:application/octet-stream;base64,"
            }],
            materials: [{
                name: "BoneMaterial",
                pbrMetallicRoughness: {
                    baseColorFactor: [1.0, 0.0, 0.0, 1.0],
                    metallicFactor: 0.0,
                    roughnessFactor: 1.0
                }
            }]
        };

        // Находим корневую кость
        const rootBone = searchBone(MMDModelBones.RootBone);
        if (!rootBone) {
            throw new Error("Корневая кость не найдена");
        }

        // Создаем корневой узел скелета
        gltf.nodes.push({
            name: MMDModelBones.RootBone,
            translation: [rootBone.position.x, rootBone.position.y, rootBone.position.z],
            rotation: [
                rootBone.rotationQuaternion.x,
                rootBone.rotationQuaternion.y,
                rootBone.rotationQuaternion.z,
                rootBone.rotationQuaternion.w
            ],
            children: []
        });

        // Карта для отслеживания индексов узлов по имени кости
        const nodeIndices = new Map<string, number>();
        nodeIndices.set(MMDModelBones.RootBone, 1); // Индекс корневой кости

        // Иерархия костей для MMD модели
        const boneHierarchy: Record<string, string[]> = {
            [MMDModelBones.RootBone]: [MMDModelBones.LowerBody, MMDModelBones.LeftFootIK, MMDModelBones.RightFootIK],
            [MMDModelBones.LowerBody]: [MMDModelBones.UpperBody, MMDModelBones.LeftHip, MMDModelBones.RightHip],
            [MMDModelBones.UpperBody]: [MMDModelBones.Neck, MMDModelBones.LeftArm, MMDModelBones.RightArm],
            [MMDModelBones.Neck]: [MMDModelBones.Head],
            [MMDModelBones.Head]: [MMDModelBones.LeftEye, MMDModelBones.RightEye],
            [MMDModelBones.LeftArm]: [MMDModelBones.LeftElbow],
            [MMDModelBones.RightArm]: [MMDModelBones.RightElbow],
            [MMDModelBones.LeftElbow]: [MMDModelBones.LeftWrist],
            [MMDModelBones.RightElbow]: [MMDModelBones.RightWrist],
            [MMDModelBones.LeftHip]: [MMDModelBones.LeftKnee],
            [MMDModelBones.RightHip]: [MMDModelBones.RightKnee],
            [MMDModelBones.LeftKnee]: [MMDModelBones.LeftAnkle],
            [MMDModelBones.RightKnee]: [MMDModelBones.RightAnkle]
        };

        // Рекурсивная функция для добавления костей в иерархию
        const addBoneNodes = (parentBoneName: string) => {
            const childBones = boneHierarchy[parentBoneName] || [];
            const parentNodeIndex = nodeIndices.get(parentBoneName)!;
            const childIndices: number[] = [];

            for (const childBoneName of childBones) {
                const bone = searchBone(childBoneName);
                if (!bone) continue;

                // Создаем узел для кости
                const nodeIndex = gltf.nodes.length;
                nodeIndices.set(childBoneName, nodeIndex);
                childIndices.push(nodeIndex);

                gltf.nodes.push({
                    name: childBoneName,
                    translation: [bone.position.x, bone.position.y, bone.position.z],
                    rotation: [
                        bone.rotationQuaternion.x,
                        bone.rotationQuaternion.y,
                        bone.rotationQuaternion.z,
                        bone.rotationQuaternion.w
                    ],
                    children: []
                });

                // Рекурсивно добавляем дочерние кости
                addBoneNodes(childBoneName);
            }

            // Добавляем индексы дочерних костей к родительской кости
            if (childIndices.length > 0) {
                gltf.nodes[parentNodeIndex].children = childIndices;
            }
        };

        // Добавляем все кости, начиная с корневой
        addBoneNodes(MMDModelBones.RootBone);

        // Добавляем кости пальцев
        const fingerBonePatterns = [
            { parent: MMDModelBones.LeftWrist, pattern: "左親指" },
            { parent: MMDModelBones.LeftWrist, pattern: "左人指" },
            { parent: MMDModelBones.LeftWrist, pattern: "左中指" },
            { parent: MMDModelBones.LeftWrist, pattern: "左薬指" },
            { parent: MMDModelBones.LeftWrist, pattern: "左小指" },
            { parent: MMDModelBones.RightWrist, pattern: "右親指" },
            { parent: MMDModelBones.RightWrist, pattern: "右人指" },
            { parent: MMDModelBones.RightWrist, pattern: "右中指" },
            { parent: MMDModelBones.RightWrist, pattern: "右薬指" },
            { parent: MMDModelBones.RightWrist, pattern: "右小指" }
        ];

        for (const { parent, pattern } of fingerBonePatterns) {
            if (!nodeIndices.has(parent)) continue;

            const parentNodeIndex = nodeIndices.get(parent)!;
            const fingerBones = Array.from(boneMap.entries())
                .filter(([name]) => name.startsWith(pattern))
                .sort((a, b) => {
                    // Сортировка по иерархии суставов пальцев (от основания к кончику)
                    const aHasJoint1 = a[0].includes("１");
                    const aHasJoint2 = a[0].includes("２");
                    const aHasJoint3 = a[0].includes("３");
                    const bHasJoint1 = b[0].includes("１");
                    const bHasJoint2 = b[0].includes("２");
                    const bHasJoint3 = b[0].includes("３");

                    if (!aHasJoint1 && !aHasJoint2 && !aHasJoint3) return -1;
                    if (!bHasJoint1 && !bHasJoint2 && !bHasJoint3) return 1;
                    if (aHasJoint1 && !bHasJoint1) return 1;
                    if (!aHasJoint1 && bHasJoint1) return -1;
                    if (aHasJoint2 && !bHasJoint2) return 1;
                    if (!aHasJoint2 && bHasJoint2) return -1;
                    if (aHasJoint3 && !bHasJoint3) return 1;
                    if (!aHasJoint3 && bHasJoint3) return -1;
                    return 0;
                });

            if (fingerBones.length === 0) continue;

            let previousNodeIndex = parentNodeIndex;
            for (const [name, bone] of fingerBones) {
                const nodeIndex = gltf.nodes.length;
                nodeIndices.set(name, nodeIndex);

                gltf.nodes.push({
                    name: name,
                    translation: [bone.position.x, bone.position.y, bone.position.z],
                    rotation: [
                        bone.rotationQuaternion.x,
                        bone.rotationQuaternion.y,
                        bone.rotationQuaternion.z,
                        bone.rotationQuaternion.w
                    ]
                });

                // Добавляем кость как дочернюю к предыдущей кости
                if (!gltf.nodes[previousNodeIndex].children) {
                    gltf.nodes[previousNodeIndex].children = [];
                }
                gltf.nodes[previousNodeIndex].children.push(nodeIndex);

                previousNodeIndex = nodeIndex;
            }
        }

        // Создаем скин для скелетной анимации
        const joints: number[] = [];
        const jointNames: string[] = [];

        // Собираем все узлы скелета
        for (const [boneName, nodeIndex] of nodeIndices.entries()) {
            joints.push(nodeIndex);
            jointNames.push(boneName);
        }

        // Создаем инверсные матрицы привязки
        const inverseBindMatricesData = new Float32Array(joints.length * 16);

        // Заполняем единичными матрицами (для простоты)
        for (let i = 0; i < joints.length; i++) {
            const offset = i * 16;
            inverseBindMatricesData[offset + 0] = 1;
            inverseBindMatricesData[offset + 5] = 1;
            inverseBindMatricesData[offset + 10] = 1;
            inverseBindMatricesData[offset + 15] = 1;
        }

        // Добавляем данные инверсных матриц в буфер
        const inverseBindMatricesBufferOffset = addToBuffer(new Uint8Array(inverseBindMatricesData.buffer));

        // Создаем буферный вид и аксессор для инверсных матриц
        const inverseBindMatricesBufferViewIndex = gltf.bufferViews.length;
        gltf.bufferViews.push({
            buffer: 0,
            byteOffset: inverseBindMatricesBufferOffset,
            byteLength: inverseBindMatricesData.byteLength
        });

        const inverseBindMatricesAccessorIndex = gltf.accessors.length;
        gltf.accessors.push({
            bufferView: inverseBindMatricesBufferViewIndex,
            componentType: 5126, // FLOAT
            count: joints.length,
            type: "MAT4"
        });

        // Создаем скин
        const skinIndex = gltf.skins ? gltf.skins.length : 0;
        if (!gltf.skins) gltf.skins = [];

        gltf.skins.push({
            inverseBindMatrices: inverseBindMatricesAccessorIndex,
            joints: joints,
            name: "AkiraSkeleton"
        });

        // Создаем простые меши для визуализации костей
        for (let nodeIndex = 1; nodeIndex < gltf.nodes.length; nodeIndex++) {
            const meshIndex = gltf.meshes.length;
            const nodeName = gltf.nodes[nodeIndex].name;

            // Находим родительский узел
            let parentNodeIndex = -1;
            for (let i = 0; i < gltf.nodes.length; i++) {
                if (gltf.nodes[i].children && gltf.nodes[i].children.includes(nodeIndex)) {
                    parentNodeIndex = i;
                    break;
                }
            }

            if (parentNodeIndex !== -1) {
                // Создаем меш для линии между родительской и текущей костью
                const parentPosition = gltf.nodes[parentNodeIndex].translation || [0, 0, 0];
                const currentPosition = gltf.nodes[nodeIndex].translation || [0, 0, 0];

                // Увеличиваем масштаб для пальцев, чтобы они были дальше от тела
                let scaleFactor = 1.0;
                let isExtremity = false;

                // Проверяем, является ли это частью конечности, которую нужно отдалить от тела
                if (nodeName.includes("指") || nodeName.includes("親指")) {
                    // Это кость пальца
                    scaleFactor = 10.0; // Увеличено с 5.0 до 10.0
                    isExtremity = true;

                    // Корректируем позицию пальца относительно родительской кости
                    if (parentNodeIndex !== -1) {
                        const parentName = gltf.nodes[parentNodeIndex].name;
                        if (parentName === MMDModelBones.LeftWrist || parentName === MMDModelBones.RightWrist) {
                            // Для пальцев, прикрепленных к запястью, увеличиваем отступ
                            const wristDir = nodeName.startsWith("左") ? [-1, 0, 0] : [1, 0, 0];
                            currentPosition[0] = parentPosition[0] + wristDir[0] * 6.0; // Увеличено с 4.0 до 6.0
                            currentPosition[1] = parentPosition[1] + wristDir[1] * 0.5;
                            currentPosition[2] = parentPosition[2] + 2.0; // Увеличено для выноса вперед
                            // Обновляем позицию в узле
                            gltf.nodes[nodeIndex].translation = currentPosition;
                        }
                    }
                }
                // Корректируем позиции локтей для лучшей визуализации
                else if (nodeName === MMDModelBones.LeftElbow || nodeName === MMDModelBones.RightElbow) {
                    scaleFactor = 3.0; // Увеличено с 2.0 до 3.0
                    isExtremity = true;

                    // Отодвигаем локти от тела гораздо дальше
                    const sideDir = nodeName === MMDModelBones.LeftElbow ? [-1, 0, 0] : [1, 0, 0];
                    currentPosition[0] = parentPosition[0] + sideDir[0] * 10.0; // Увеличено с 6.0 до 10.0
                    currentPosition[1] = parentPosition[1] + 1.0; // Приподнимаем локти
                    currentPosition[2] = parentPosition[2] + 2.0; // Выносим вперед

                    gltf.nodes[nodeIndex].translation = currentPosition;
                }
                // Корректируем ноги для лучшей визуализации
                else if (nodeName === MMDModelBones.LeftKnee || nodeName === MMDModelBones.RightKnee) {
                    scaleFactor = 3.0; // Увеличено с 2.0 до 3.0
                    isExtremity = true;

                    // Отодвигаем колени для лучшей видимости
                    const sideDir = nodeName === MMDModelBones.LeftKnee ? [-1.5, 0, 0] : [1.5, 0, 0];
                    currentPosition[0] = parentPosition[0] + sideDir[0] * 5.0; // Увеличено с 3.0 до 5.0
                    currentPosition[1] = parentPosition[1] - 12.0; // Опускаем колени ниже (с 7.0 до 12.0)
                    currentPosition[2] = parentPosition[2] + 3.0; // Значительно выдвигаем вперед

                    gltf.nodes[nodeIndex].translation = currentPosition;

                    // Полностью переопределяем поворот колена для реалистичной стойки
                    const isLeft = nodeName === MMDModelBones.LeftKnee;
                    gltf.nodes[nodeIndex].rotation = [
                        0.2, // Был 0.15 (X) -> теперь Y (сгибание колена)
                        0.15 * (isLeft ? -1 : 1), // Был Y (0.2) -> теперь X (отклонение в сторону)
                        0.1 * (isLeft ? 1 : -1), // Поворот по Z для естественной стойки
                        0.96 // Нормализованный компонент W кватерниона
                    ];
                }
                else if (nodeName === MMDModelBones.LeftAnkle || nodeName === MMDModelBones.RightAnkle) {
                    scaleFactor = 3.0;
                    isExtremity = true;

                    // Отодвигаем лодыжки для лучшей видимости
                    const sideDir = nodeName === MMDModelBones.LeftAnkle ? [-1.5, 0, 0] : [1.5, 0, 0];
                    currentPosition[0] = parentPosition[0] + sideDir[0] * 2.0;
                    currentPosition[1] = parentPosition[1] - 5.0;
                    currentPosition[2] = parentPosition[2] + 6.0;

                    gltf.nodes[nodeIndex].translation = currentPosition;

                    // Полностью переопределяем поворот лодыжек для натуральной стойки
                    const isLeft = nodeName === MMDModelBones.LeftAnkle;
                    gltf.nodes[nodeIndex].rotation = [
                        0.05 * (isLeft ? -1 : 1), // Был 0.25 (X) -> теперь Y (поворот по горизонтали)
                        0.25, // Был 0.05 (Y) -> теперь X (угол стопы вниз)
                        0.15 * (isLeft ? -1 : 1), // Поворот по Z (разворот стопы наружу)
                        0.95 // Нормализованный компонент W кватерниона
                    ];
                }
                else if (nodeName === MMDModelBones.LeftHip || nodeName === MMDModelBones.RightHip) {
                    scaleFactor = 3.0;
                    isExtremity = true;

                    // Расставляем бедра шире
                    const sideDir = nodeName === MMDModelBones.LeftHip ? [-1, 0, 0] : [1, 0, 0];
                    currentPosition[0] = parentPosition[0] + sideDir[0] * 8.0;
                    currentPosition[1] = parentPosition[1] - 5.0;
                    currentPosition[2] = parentPosition[2] + 1.5;

                    gltf.nodes[nodeIndex].translation = currentPosition;

                    // Полностью переопределяем поворот бедер для реалистичной стойки
                    const isLeft = nodeName === MMDModelBones.LeftHip;
                    gltf.nodes[nodeIndex].rotation = [
                        0.15, // Был 0.1 (X) -> теперь Y (поворот вперед)
                        0.1 * (isLeft ? -1 : 1), // Был 0.15 (Y) -> теперь X (разворот бедра)
                        0.1 * (isLeft ? 1 : -1), // Разворот "наружу" по Z
                        0.97 // Нормализованный компонент W кватерниона
                    ];
                }
                // Улучшаем позицию рук
                else if (nodeName === MMDModelBones.LeftWrist || nodeName === MMDModelBones.RightWrist) {
                    scaleFactor = 3.0; // Увеличено с 2.0 до 3.0
                    isExtremity = true;

                    // Отодвигаем запястья от локтей
                    const sideDir = nodeName === MMDModelBones.LeftWrist ? [-1, 0, 0] : [1, 0, 0];
                    currentPosition[0] = parentPosition[0] + sideDir[0] * 8.0; // Увеличено с 5.0 до 8.0
                    currentPosition[1] = parentPosition[1] - 1.0; // Немного ниже локтей
                    currentPosition[2] = parentPosition[2] + 3.0; // Выносим запястья вперед

                    gltf.nodes[nodeIndex].translation = currentPosition;
                }
                else if (nodeName === MMDModelBones.LeftArm || nodeName === MMDModelBones.RightArm) {
                    scaleFactor = 3.0; // Увеличено с 2.0 до 3.0
                    isExtremity = true;

                    // Расставляем плечи шире
                    const sideDir = nodeName === MMDModelBones.LeftArm ? [-1, 0, 0] : [1, 0, 0];
                    currentPosition[0] = parentPosition[0] + sideDir[0] * 8.0; // Увеличено с 5.0 до 8.0
                    currentPosition[1] = parentPosition[1] + 1.0; // Приподнимаем плечи
                    currentPosition[2] = parentPosition[2] + 1.0; // Небольшое смещение вперед

                    gltf.nodes[nodeIndex].translation = currentPosition;
                }

                // Позиции для линии (начало и конец)
                const linePositions = new Float32Array([
                    parentPosition[0], parentPosition[1], parentPosition[2],
                    currentPosition[0], currentPosition[1], currentPosition[2]
                ]);

                // Выбираем цвет линии в зависимости от типа кости
                let materialIndex = 0; // Базовый материал (красный по умолчанию)

                // Если у нас нет достаточного количества материалов, создаем их
                if (gltf.materials.length === 1) {
                    // Добавляем материалы разных цветов
                    gltf.materials.push({
                        name: "ArmMaterial",
                        pbrMetallicRoughness: {
                            baseColorFactor: [0.0, 0.7, 1.0, 1.0], // Голубой для рук
                            metallicFactor: 0.0,
                            roughnessFactor: 1.0
                        }
                    });

                    gltf.materials.push({
                        name: "LegMaterial",
                        pbrMetallicRoughness: {
                            baseColorFactor: [0.0, 1.0, 0.3, 1.0], // Зеленый для ног
                            metallicFactor: 0.0,
                            roughnessFactor: 1.0
                        }
                    });

                    gltf.materials.push({
                        name: "FingerMaterial",
                        pbrMetallicRoughness: {
                            baseColorFactor: [1.0, 0.7, 0.0, 1.0], // Оранжевый для пальцев
                            metallicFactor: 0.0,
                            roughnessFactor: 1.0
                        }
                    });

                    gltf.materials.push({
                        name: "TorsoMaterial",
                        pbrMetallicRoughness: {
                            baseColorFactor: [0.8, 0.2, 0.8, 1.0], // Фиолетовый для туловища
                            metallicFactor: 0.0,
                            roughnessFactor: 1.0
                        }
                    });
                }

                // Выбираем материал в зависимости от типа кости
                if (nodeName.includes("指") || nodeName.includes("親指")) {
                    materialIndex = 3; // Материал для пальцев
                } else if (nodeName.includes("足") || nodeName === MMDModelBones.LeftKnee ||
                    nodeName === MMDModelBones.RightKnee || nodeName === MMDModelBones.LeftHip ||
                    nodeName === MMDModelBones.RightHip) {
                    materialIndex = 2; // Материал для ног
                } else if (nodeName.includes("腕") || nodeName === MMDModelBones.LeftElbow ||
                    nodeName === MMDModelBones.RightElbow || nodeName === MMDModelBones.LeftArm ||
                    nodeName === MMDModelBones.RightArm || nodeName === MMDModelBones.LeftWrist ||
                    nodeName === MMDModelBones.RightWrist) {
                    materialIndex = 1; // Материал для рук
                } else if (nodeName.includes("体") || nodeName === MMDModelBones.UpperBody ||
                    nodeName === MMDModelBones.LowerBody) {
                    materialIndex = 4; // Материал для туловища
                }

                const linePositionsOffset = addToBuffer(new Uint8Array(linePositions.buffer));

                // Делаем линии толще для лучшей видимости
                // Создаем данные для цилиндрической линии вместо простой линии
                const cylinderRadius = isExtremity ? 0.2 : 0.1; // Радиус цилиндра
                const segments = 8; // Количество сегментов для боковой поверхности

                // Добавляем буферный вид для линии
                const positionBufferViewIndex = gltf.bufferViews.length;
                gltf.bufferViews.push({
                    buffer: 0,
                    byteOffset: linePositionsOffset,
                    byteLength: linePositions.byteLength,
                    target: 34962 // ARRAY_BUFFER
                });

                // Добавляем аксессор для линии
                const positionAccessorIndex = gltf.accessors.length;
                gltf.accessors.push({
                    bufferView: positionBufferViewIndex,
                    componentType: 5126, // FLOAT
                    count: 2,
                    type: "VEC3",
                    min: [
                        Math.min(parentPosition[0], currentPosition[0]),
                        Math.min(parentPosition[1], currentPosition[1]),
                        Math.min(parentPosition[2], currentPosition[2])
                    ],
                    max: [
                        Math.max(parentPosition[0], currentPosition[0]),
                        Math.max(parentPosition[1], currentPosition[1]),
                        Math.max(parentPosition[2], currentPosition[2])
                    ]
                });

                // Индексы для линии
                const indices = new Uint16Array([0, 1]);
                const indicesOffset = addToBuffer(new Uint8Array(indices.buffer));

                // Добавляем буферный вид для индексов
                const indicesBufferViewIndex = gltf.bufferViews.length;
                gltf.bufferViews.push({
                    buffer: 0,
                    byteOffset: indicesOffset,
                    byteLength: indices.byteLength,
                    target: 34963 // ELEMENT_ARRAY_BUFFER
                });

                // Добавляем аксессор для индексов
                const indicesAccessorIndex = gltf.accessors.length;
                gltf.accessors.push({
                    bufferView: indicesBufferViewIndex,
                    componentType: 5123, // UNSIGNED_SHORT
                    count: indices.length,
                    type: "SCALAR",
                    min: [0],
                    max: [1]
                });

                // Создаем меш с линией
                gltf.meshes.push({
                    name: `${nodeName}_mesh`,
                    primitives: [{
                        attributes: {
                            POSITION: positionAccessorIndex
                        },
                        indices: indicesAccessorIndex,
                        mode: 1, // LINES
                        material: materialIndex
                    }]
                });
            } else {
                // Для корневых костей создаем просто точку
                const pointPositions = new Float32Array([0, 0, 0]);
                const pointPositionsOffset = addToBuffer(new Uint8Array(pointPositions.buffer));

                // Добавляем буферный вид для точки
                const positionBufferViewIndex = gltf.bufferViews.length;
                gltf.bufferViews.push({
                    buffer: 0,
                    byteOffset: pointPositionsOffset,
                    byteLength: pointPositions.byteLength,
                    target: 34962 // ARRAY_BUFFER
                });

                // Добавляем аксессор для точки
                const positionAccessorIndex = gltf.accessors.length;
                gltf.accessors.push({
                    bufferView: positionBufferViewIndex,
                    componentType: 5126, // FLOAT
                    count: 1,
                    type: "VEC3",
                    min: [0, 0, 0],
                    max: [0, 0, 0]
                });

                // Создаем меш с точкой, делаем точку больше
                gltf.meshes.push({
                    name: `${nodeName}_mesh`,
                    primitives: [{
                        attributes: {
                            POSITION: positionAccessorIndex
                        },
                        mode: 0, // POINTS
                        material: 0
                    }]
                });
            }

            // Добавляем ссылку на меш к узлу и связываем со скином
            gltf.nodes[nodeIndex].mesh = meshIndex;
            gltf.nodes[nodeIndex].skin = skinIndex;
        }

        // Создаем анимацию
        const animation: {
            name: string;
            channels: Array<{
                sampler: number;
                target: {
                    node: number;
                    path: string;
                }
            }>;
            samplers: Array<{
                input: number;
                output: number;
                interpolation: string;
            }>;
        } = {
            name: "AkiraMotion",
            channels: [],
            samplers: []
        };

        // Добавляем временные точки для анимации (30 FPS)
        const times = new Float32Array(keyframes.map((_, i) => i / 30));
        const timesBufferOffset = addToBuffer(new Uint8Array(times.buffer));

        // Добавляем буферный вид для временных точек
        const timeBufferViewIndex = gltf.bufferViews.length;
        gltf.bufferViews.push({
            buffer: 0,
            byteOffset: timesBufferOffset,
            byteLength: times.byteLength
        });

        // Добавляем аксессор для временных точек
        const timeAccessorIndex = gltf.accessors.length;
        gltf.accessors.push({
            bufferView: timeBufferViewIndex,
            componentType: 5126, // FLOAT
            count: times.length,
            type: "SCALAR",
            min: [times[0]],
            max: [times[times.length - 1]]
        });

        // Добавляем анимацию для каждой кости
        for (const [boneName, nodeIndex] of nodeIndices.entries()) {
            // Собираем данные позиции и вращения из кадров
            const positions: number[] = [];
            const rotations: number[] = [];

            for (const keyframe of keyframes) {
                const boneData = keyframe.keyData.find(bd => bd.boneName === boneName);

                if (boneData) {
                    // Позиция кости
                    positions.push(
                        boneData.position[0],
                        boneData.position[1],
                        boneData.position[2]
                    );

                    // Вращение кости (убедимся, что кватернион нормализован)
                    let qx = boneData.quaternion[0] || 0;
                    let qy = boneData.quaternion[1] || 0;
                    let qz = boneData.quaternion[2] || 0;
                    let qw = boneData.quaternion[3] || 1.0;

                    // Нормализация кватерниона
                    const len = Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw);
                    if (len > 0 && len !== 1) {
                        qx /= len;
                        qy /= len;
                        qz /= len;
                        qw /= len;
                    }

                    rotations.push(qx, qy, qz, qw);
                } else {
                    // Если нет данных для этого кадра, используем предыдущие значения
                    if (positions.length >= 3) {
                        positions.push(
                            positions[positions.length - 3],
                            positions[positions.length - 2],
                            positions[positions.length - 1]
                        );
                    } else {
                        // Или нулевые значения, если нет предыдущих данных
                        positions.push(0, 0, 0);
                    }

                    if (rotations.length >= 4) {
                        rotations.push(
                            rotations[rotations.length - 4],
                            rotations[rotations.length - 3],
                            rotations[rotations.length - 2],
                            rotations[rotations.length - 1]
                        );
                    } else {
                        // Или единичный кватернион, если нет предыдущих данных
                        rotations.push(0, 0, 0, 1);
                    }
                }
            }

            if (positions.length === 0 || rotations.length === 0) continue;

            // Создаем буферы для позиций и вращений
            const positionsArray = new Float32Array(positions);
            const rotationsArray = new Float32Array(rotations);

            // Добавляем данные позиции в буфер
            const positionsBufferOffset = addToBuffer(new Uint8Array(positionsArray.buffer));

            // Добавляем буферный вид для позиций
            const positionBufferViewIndex = gltf.bufferViews.length;
            gltf.bufferViews.push({
                buffer: 0,
                byteOffset: positionsBufferOffset,
                byteLength: positionsArray.byteLength
            });

            // Добавляем аксессор для позиций
            const positionAccessorIndex = gltf.accessors.length;
            gltf.accessors.push({
                bufferView: positionBufferViewIndex,
                componentType: 5126, // FLOAT
                count: keyframes.length,
                type: "VEC3",
                min: [
                    Math.min(...positions.filter((_, i) => i % 3 === 0)),
                    Math.min(...positions.filter((_, i) => i % 3 === 1)),
                    Math.min(...positions.filter((_, i) => i % 3 === 2))
                ],
                max: [
                    Math.max(...positions.filter((_, i) => i % 3 === 0)),
                    Math.max(...positions.filter((_, i) => i % 3 === 1)),
                    Math.max(...positions.filter((_, i) => i % 3 === 2))
                ]
            });

            // Добавляем данные вращения в буфер
            const rotationsBufferOffset = addToBuffer(new Uint8Array(rotationsArray.buffer));

            // Добавляем буферный вид для вращений
            const rotationBufferViewIndex = gltf.bufferViews.length;
            gltf.bufferViews.push({
                buffer: 0,
                byteOffset: rotationsBufferOffset,
                byteLength: rotationsArray.byteLength
            });

            // Добавляем аксессор для вращений
            const rotationAccessorIndex = gltf.accessors.length;
            gltf.accessors.push({
                bufferView: rotationBufferViewIndex,
                componentType: 5126, // FLOAT
                count: keyframes.length,
                type: "VEC4",
                min: [
                    Math.min(...rotations.filter((_, i) => i % 4 === 0)),
                    Math.min(...rotations.filter((_, i) => i % 4 === 1)),
                    Math.min(...rotations.filter((_, i) => i % 4 === 2)),
                    Math.min(...rotations.filter((_, i) => i % 4 === 3))
                ],
                max: [
                    Math.max(...rotations.filter((_, i) => i % 4 === 0)),
                    Math.max(...rotations.filter((_, i) => i % 4 === 1)),
                    Math.max(...rotations.filter((_, i) => i % 4 === 2)),
                    Math.max(...rotations.filter((_, i) => i % 4 === 3))
                ]
            });

            // Добавляем сэмплеры анимации
            const positionSamplerIndex = animation.samplers.length;
            animation.samplers.push({
                input: timeAccessorIndex,
                output: positionAccessorIndex,
                interpolation: "LINEAR"
            });

            const rotationSamplerIndex = animation.samplers.length;
            animation.samplers.push({
                input: timeAccessorIndex,
                output: rotationAccessorIndex,
                interpolation: "LINEAR"
            });

            // Добавляем каналы анимации для позиции и вращения
            animation.channels.push({
                sampler: positionSamplerIndex,
                target: {
                    node: nodeIndex,
                    path: "translation"
                }
            });

            animation.channels.push({
                sampler: rotationSamplerIndex,
                target: {
                    node: nodeIndex,
                    path: "rotation"
                }
            });
        }

        // Добавляем анимацию в glTF
        gltf.animations.push(animation);

        // Объединяем все буферы в один
        const totalBufferData = new Uint8Array(totalBufferSize);
        for (const buffer of buffers) {
            totalBufferData.set(buffer.data, buffer.byteOffset);
        }

        // Обновляем общий размер буфера
        gltf.buffers[0].byteLength = totalBufferSize;

        // Кодируем буфер в base64
        let base64Buffer = '';
        for (let i = 0; i < totalBufferData.length; i++) {
            base64Buffer += String.fromCharCode(totalBufferData[i]);
        }
        gltf.buffers[0].uri = `data:application/octet-stream;base64,${btoa(base64Buffer)}`;

        // Экспортируем glTF как JSON
        const gltfString = JSON.stringify(gltf, null, 2);
        return new Blob([gltfString], { type: 'application/json' });
    }
}