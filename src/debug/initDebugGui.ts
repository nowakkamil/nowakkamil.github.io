import GUI from 'lil-gui';

import type { World } from '../world/World';

type DebugTargets = ReturnType<World['getDebugTargets']>;
type ShaderUniformComponent = DebugTargets['shaderUniformComponents'][number];

const getShaderLabel = (shader: ShaderUniformComponent, index: number): string => {
    if (shader.bindScrollFloatStrength) {
        return 'Main particles';
    }
    if (shader.bindColoredLightVisibility) {
        return 'Colored light';
    }
    if (shader.bindBackgroundVisibility) {
        return 'Ambient particles';
    }
    if (shader.bindEllipsisVisibility) {
        return 'Ellipsis';
    }
    if (shader.bindScrollProgress) {
        return 'Floating text';
    }

    return `Shader ${index + 1}`;
};

const addUniformMonitor = (
    folder: GUI,
    shader: ShaderUniformComponent,
    uniformName: string,
    label: string,
): void => {
    const uniform = shader.material.uniforms[uniformName];
    if (!uniform || typeof uniform.value !== 'number') {
        return;
    }

    folder.add(uniform, 'value').name(label).listen().disable();
};

export const initDebugGui = ({
    camera,
    mainCloudMaterial,
    coloredLightMaterial,
    shaderUniformComponents,
    selectiveBloom,
    bloomPass,
    afterimagePass,
}: DebugTargets): GUI => {
    const gui = new GUI({ title: 'Scene' });
    const ambientShader = shaderUniformComponents.find((shader) => shader.bindBackgroundVisibility);
    const floatingTextShader = shaderUniformComponents.find(
        (shader) => shader.bindScrollProgress && !shader.bindColoredLightVisibility,
    );
    const ellipsisShader = shaderUniformComponents.find((shader) => shader.bindEllipsisVisibility);

    const particles = gui.addFolder('1. Particles');
    const mainCloud = particles.addFolder('Main cloud');
    mainCloud.add(mainCloudMaterial, 'visible');
    mainCloud.add(mainCloudMaterial.uniforms.uSizeBase, 'value', 10, 1000, 1).name('base size');
    mainCloud
        .add(mainCloudMaterial.uniforms.uCloudPointSizeScale, 'value', 0.1, 10, 0.01)
        .name('point scale');
    mainCloud
        .add(mainCloudMaterial.uniforms.uCloudBrightness, 'value', 0, 10, 0.01)
        .name('brightness');
    mainCloud.add(mainCloudMaterial.uniforms.uParticleDensity, 'value', 0, 1, 0.01).name('density');
    mainCloud.add(mainCloudMaterial.uniforms.uSparkleStrength, 'value', 0, 2, 0.01).name('sparkle');

    if (ambientShader) {
        const ambient = particles.addFolder('Ambient particles');
        ambient.add(ambientShader.material, 'visible');
        addUniformMonitor(ambient, ambientShader, 'uPointerStrength', 'pointer influence');
    }

    if (floatingTextShader) {
        const floatingText = particles.addFolder('Floating text');
        const {
            material,
            material: { uniforms },
        } = floatingTextShader;
        floatingText.add(material, 'visible');
        floatingText.add(uniforms.uAmplitude, 'value', 0, 1, 0.01).name('orbit amplitude');
        floatingText.add(uniforms.uSpeed, 'value', 0, 6, 0.01).name('orbit speed');
        floatingText.add(uniforms.uSize, 'value', 0.1, 3, 0.01).name('point size');
        floatingText.add(uniforms.uRevealDelay, 'value', 0, 10, 0.05).name('reveal delay');
        floatingText.add(uniforms.uBloomStrength, 'value', 0, 6, 0.1).name('bloom');
        floatingText.add(uniforms.uHazeStrength, 'value', 0, 6, 0.1).name('haze');
    }

    if (ellipsisShader) {
        const ellipsis = particles.addFolder('Ellipsis');
        const {
            material,
            material: { uniforms },
        } = ellipsisShader;
        const coreMaxDistance = uniforms.uCoreMaxDist.value;
        const maxDistance = uniforms.uMaxDist.value;
        const ringMaxRadius = uniforms.uRingMaxRadius.value;
        ellipsis.add(material, 'visible');
        ellipsis
            .add(uniforms.uCoreMaxDist, 'value', coreMaxDistance * 0.25, coreMaxDistance * 2, 0.1)
            .name('core radius');
        ellipsis
            .add(uniforms.uMaxDist, 'value', maxDistance * 0.25, maxDistance * 2, 0.1)
            .name('glow radius');
        ellipsis
            .add(uniforms.uRingMaxRadius, 'value', ringMaxRadius * 0.5, ringMaxRadius * 1.5, 0.1)
            .name('ring radius');
        ellipsis.add(uniforms.uRingAspect, 'value', 0.1, 3, 0.01).name('ring aspect');

        const glowCenter = ellipsis.addFolder('Glow center');
        glowCenter.add(uniforms.uGlowCenter.value, 'x', -50, 50, 0.1);
        glowCenter.add(uniforms.uGlowCenter.value, 'y', -50, 50, 0.1);
        glowCenter.add(uniforms.uGlowCenter.value, 'z', -50, 50, 0.1);
    }

    const colorAndLight = gui.addFolder('2. Color & light');
    const palette = colorAndLight.addFolder('Gemini palette');
    const geminiColors = mainCloudMaterial.uniforms.uGeminiColors.value;
    ['blue', 'green', 'purple', 'red', 'teal'].forEach((name, index) => {
        palette.addColor(geminiColors, index).name(name);
    });
    const mobileLightColors = coloredLightMaterial.uniforms.uMobileLightColors.value;
    palette.addColor(mobileLightColors, 0).name('mobile purple');
    palette.addColor(mobileLightColors, 1).name('mobile teal');

    const materialColors = colorAndLight.addFolder('Material colors');
    materialColors.addColor(mainCloudMaterial.uniforms.uColor, 'value').name('cloud base');
    materialColors.addColor(mainCloudMaterial.uniforms.uBloomColor, 'value').name('cloud bloom');
    if (ambientShader) {
        materialColors.addColor(ambientShader.material.uniforms.uColor, 'value').name('ambient');
    }
    if (floatingTextShader) {
        materialColors
            .addColor(floatingTextShader.material.uniforms.uBloomColor, 'value')
            .name('floating text');
    }

    const coloredLight = colorAndLight.addFolder('Colored light');
    coloredLight
        .add(coloredLightMaterial.uniforms.uIntensity, 'value', 0, 0.6, 0.01)
        .name('intensity');
    coloredLight.add(coloredLightMaterial.uniforms.uSpeed, 'value', 0, 200, 1).name('speed');
    coloredLight.add(coloredLightMaterial.uniforms.uWidth, 'value', 50, 600, 1).name('width');
    coloredLight.add(coloredLightMaterial.uniforms.uHeight, 'value', 10, 150, 1).name('height');
    coloredLight
        .add(coloredLightMaterial.uniforms.uHorizontalScale, 'value', 50, 300, 1)
        .name('horizontal scale');
    coloredLight
        .add(coloredLightMaterial.uniforms.uHorizonY, 'value', -200, 0, 1)
        .name('horizon y');
    coloredLight
        .add(coloredLightMaterial.uniforms.uWaveAmplitudeScale, 'value', 0, 2, 0.01)
        .name('wave amplitude');
    coloredLight
        .add(coloredLightMaterial.uniforms.uColorWindowSize, 'value', 2, 5, 1)
        .name('color count');

    const motionAndShape = gui.addFolder('3. Motion & shape');
    const windDirection = mainCloudMaterial.uniforms.uWindDirection.value;
    const wind = motionAndShape.addFolder('Wind direction');
    wind.add(windDirection, 'x', -1, 1, 0.01);
    wind.add(windDirection, 'y', -1, 1, 0.01);
    wind.add(windDirection, 'z', -1, 1, 0.01);

    const textAndTunnel = motionAndShape.addFolder('Text / tunnel');
    textAndTunnel
        .add(mainCloudMaterial.uniforms.uCurveStrength, 'value', 0, 2, 0.01)
        .name('curve strength');
    textAndTunnel.add(mainCloudMaterial.uniforms.uCurveBow, 'value', 0, 1, 0.01).name('curve bow');
    textAndTunnel
        .add(mainCloudMaterial.uniforms.uTunnelRadiusScale, 'value', 0.25, 2.5, 0.01)
        .name('radius scale');
    textAndTunnel
        .add(mainCloudMaterial.uniforms.uTunnelBokehSizeScale, 'value', 0, 2, 0.01)
        .name('bokeh size');

    const cameraAndEffects = gui.addFolder('4. Camera & effects');
    const cameraFolder = cameraAndEffects.addFolder('Camera');
    const updateProjectionMatrix = (): void => camera.updateProjectionMatrix();
    cameraFolder.add(camera, 'zoom', 0.5, 2, 0.01).onChange(updateProjectionMatrix);
    cameraFolder.add(camera, 'near', 0.01, 10, 0.01).onChange(updateProjectionMatrix);
    cameraFolder.add(camera, 'far', 100, 2000, 1).onChange(updateProjectionMatrix);

    const postProcessing = cameraAndEffects.addFolder('Post-processing');
    postProcessing.add(bloomPass, 'enabled').name('bloom enabled');
    postProcessing.add(selectiveBloom, 'strengthScale', 0, 3, 0.01).name('bloom strength');
    postProcessing.add(bloomPass, 'threshold', 0, 1, 0.01);
    postProcessing.add(bloomPass, 'radius', 0, 1, 0.01);
    postProcessing.add(afterimagePass, 'enabled').name('afterimage enabled');

    const runtime = gui.addFolder('5. Runtime');
    shaderUniformComponents.forEach((shader, index) => {
        const folder = runtime.addFolder(getShaderLabel(shader, index));
        const { uniforms } = shader.material;

        addUniformMonitor(folder, shader, 'uTime', 'time');

        if (uniforms.uTunnelSpinStrength) {
            folder.add(uniforms.uTunnelSpinStrength, 'value', 0, 1, 0.01).name('tunnel spin');
            addUniformMonitor(folder, shader, 'uTunnelRotation', 'tunnel rotation');
        }

        if (uniforms.uScroll && shader.bindScrollProgress) {
            addUniformMonitor(folder, shader, 'uScroll', 'scroll');
        }

        if (uniforms.uShift && shader.shiftSpeed !== undefined) {
            folder.add(shader, 'shiftSpeed', -1, 1, 0.01).name('shift speed');
            addUniformMonitor(folder, shader, 'uShift', 'shift');
        }

        if (
            uniforms.uVisibility &&
            (shader.bindBackgroundVisibility ||
                shader.bindColoredLightVisibility ||
                shader.bindEllipsisVisibility)
        ) {
            addUniformMonitor(folder, shader, 'uVisibility', 'visibility');
        }

        if (shader.bindScrollFloatStrength) {
            addUniformMonitor(folder, shader, 'uFloatStrength', 'float strength');
            addUniformMonitor(folder, shader, 'uWindStrength', 'wind strength');
        }

        addUniformMonitor(folder, shader, 'uAspect', 'aspect');
    });

    [particles, colorAndLight, motionAndShape, cameraAndEffects, runtime].forEach((group) =>
        group.close(),
    );

    return gui;
};
