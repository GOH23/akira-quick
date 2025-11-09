"use client"
import { CreateGround, DirectionalLight, Engine, FlyCamera, HemisphericLight, RegisterSceneLoaderPlugin, Scene, ShadowGenerator, Vector3 } from "@babylonjs/core";
import { useEffect, useRef, useState } from "react"
import { BpmxLoader, GetMmdWasmInstance, MmdStandardMaterialBuilder, MmdWasmInstanceTypeMPD, MmdWasmRuntime, SdefInjector } from "babylon-mmd"
import "babylon-mmd/esm/Loader/Optimized/bpmxLoader";

export default function MMDScene({ loadModel }: { loadModel: (modelScene: Scene, mmdRuntime: MmdWasmRuntime, materialBuilder: MmdStandardMaterialBuilder) => void }) {
    const canvasRef = useRef<HTMLCanvasElement>(null)

    const [debugMode] = useState(true)
    useEffect(() => {
        if (canvasRef.current) {
            RegisterSceneLoaderPlugin(new BpmxLoader())
            const engine = new Engine(canvasRef.current, true, {}, true);


            GetMmdWasmInstance(new MmdWasmInstanceTypeMPD()).then((mmdWasmInstance) => {
                const mmdscene = new Scene(engine);
                SdefInjector.OverrideEngineCreateEffect(engine);
                const mmdRuntime = new MmdWasmRuntime(mmdWasmInstance, mmdscene);
                const materialBuilder = new MmdStandardMaterialBuilder();
                materialBuilder.loadOutlineRenderingProperties = (): void => { /* do nothing */ };
                var camera = new FlyCamera("camera", new Vector3(0, 15, -35), mmdscene);
                mmdRuntime.register(mmdscene)
                if (debugMode) {
                    const hemisphericLight = new HemisphericLight("HemisphericLight", new Vector3(0, 1, 0), mmdscene);
                    hemisphericLight.intensity = 0.3;
                    hemisphericLight.specular.set(0, 0, 0);
                    hemisphericLight.groundColor.set(1, 1, 1);
                    const directionalLight = new DirectionalLight("directionalLight", new Vector3(0.5, -1, 1), mmdscene);
                    directionalLight.intensity = 0.7;
                    directionalLight.autoCalcShadowZBounds = false;
                    directionalLight.autoUpdateExtends = false;
                    directionalLight.shadowMaxZ = 20;
                    directionalLight.shadowMinZ = -20;
                    directionalLight.orthoTop = 18;
                    directionalLight.orthoBottom = -3;
                    directionalLight.orthoLeft = -10;
                    directionalLight.orthoRight = 10;
                    directionalLight.shadowOrthoScale = 0;
                    const shadowGenerator = new ShadowGenerator(1024, directionalLight, true);
                    shadowGenerator.transparencyShadow = true;
                    shadowGenerator.usePercentageCloserFiltering = true;
                    shadowGenerator.forceBackFacesOnly = false;
                    shadowGenerator.bias = 0.01;
                    shadowGenerator.filteringQuality = ShadowGenerator.QUALITY_HIGH;
                    shadowGenerator.frustumEdgeFalloff = 0.1
                    const ground = CreateGround("ground2", { width: 120, height: 120, subdivisions: 2, updatable: false }, mmdscene);
                    ground.receiveShadows = true;
                }
                loadModel(mmdscene, mmdRuntime, materialBuilder)
                engine.runRenderLoop(() => {
                    mmdscene.render()
                });
            })
        }
    }, [canvasRef])
    return <canvas className={debugMode ? "block w-full h-fit my-3" : 'hidden'} ref={canvasRef} />
}