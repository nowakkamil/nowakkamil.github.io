import * as THREE from 'three';
import { clamp01 } from '../../utils/animation';
import { seeded } from './constellationConstants';

/**
 * Creates a star-glow texture: a radial gradient core with 4-point
 * diffraction spikes and fainter 45-degree secondary spikes.
 */
export function createStarTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    const size = 192;
    const center = size / 2;
    const context = canvas.getContext('2d');

    canvas.width = size;
    canvas.height = size;

    if (context) {
        const gradient = context.createRadialGradient(center, center, 0, center, center, center);

        gradient.addColorStop(0, 'rgba(255,255,255,1.0)');
        gradient.addColorStop(0.05, 'rgba(255,255,255,0.92)');
        gradient.addColorStop(0.16, 'rgba(220,240,255,0.42)');
        gradient.addColorStop(0.38, 'rgba(160,210,255,0.10)');
        gradient.addColorStop(0.72, 'rgba(100,160,240,0.025)');
        gradient.addColorStop(1, 'rgba(80,130,220,0)');

        context.fillStyle = gradient;
        context.fillRect(0, 0, size, size);

        const spikeLen = center * 0.92;
        const spikeWidth = 0.9;
        const spikeAlpha = 0.18;
        const drawSpike = (angle: number): void => {
            context.save();
            context.translate(center, center);
            context.rotate(angle);
            const spike = context.createLinearGradient(0, 0, spikeLen, 0);
            spike.addColorStop(0, `rgba(255,255,255,${spikeAlpha})`);
            spike.addColorStop(0.55, `rgba(210,230,255,${spikeAlpha * 0.4})`);
            spike.addColorStop(1, 'rgba(180,210,255,0)');
            context.globalCompositeOperation = 'lighter';
            context.strokeStyle = spike;
            context.lineWidth = spikeWidth;
            context.beginPath();
            context.moveTo(0, 0);
            context.lineTo(spikeLen, 0);
            context.stroke();
            context.restore();
        };
        drawSpike(0);
        drawSpike(Math.PI);
        drawSpike(Math.PI * 0.5);
        drawSpike(Math.PI * 1.5);

        context.globalAlpha = 0.45;
        drawSpike(Math.PI * 0.25);
        drawSpike(Math.PI * 0.75);
        drawSpike(Math.PI * 1.25);
        drawSpike(Math.PI * 1.75);
        context.globalAlpha = 1;
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    return texture;
}

/**
 * Creates a soft nebula/fog texture: procedural grain, soft bands, and
 * a layered radial edge fade — suitable for sprite-based fog glows.
 */
export function createFogTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    const size = 256;
    const center = size / 2;
    const context = canvas.getContext('2d');

    canvas.width = size;
    canvas.height = size;

    if (context) {
        const cloud = document.createElement('canvas');
        const cloudContext = cloud.getContext('2d');

        cloud.width = size;
        cloud.height = size;

        if (cloudContext) {
            const image = cloudContext.createImageData(size, size);
            const data = image.data;

            for (let y = 0; y < size; y += 1) {
                for (let x = 0; x < size; x += 1) {
                    const nx = (x - center) / center;
                    const ny = (y - center) / center;
                    const distance = Math.sqrt(nx * nx * 0.78 + ny * ny * 1.22);
                    const falloff = Math.max(0, 1 - distance);
                    const shear = nx * 1.7 + ny * 0.75;
                    const softBands = Math.sin(shear * 6.5 + ny * 2.2) * 0.5 + 0.5;
                    const grain =
                        seeded(x * 0.37 + y * 1.91) * 0.34 + seeded(x * 1.17 - y * 0.63) * 0.18;
                    const pocket = Math.max(0, 1 - Math.abs(ny + Math.sin(nx * 4.4) * 0.16));
                    const alpha =
                        Math.pow(falloff, 1.55) *
                        (0.11 + softBands * 0.14 + grain * 0.13 + pocket * 0.08);
                    const index = (y * size + x) * 4;

                    data[index] = 255;
                    data[index + 1] = 255;
                    data[index + 2] = 255;
                    data[index + 3] = Math.round(clamp01(alpha) * 255);
                }
            }

            cloudContext.putImageData(image, 0, 0);
            context.filter = 'blur(7px)';
            context.drawImage(cloud, 0, 0);
            context.filter = 'none';
        }

        context.globalCompositeOperation = 'screen';

        for (let index = 0; index < 4; index += 1) {
            const y = center + (index - 1.5) * 24;
            const wisp = context.createLinearGradient(24, y - 46, size - 24, y + 34);

            wisp.addColorStop(0, 'rgba(255,255,255,0)');
            wisp.addColorStop(0.32, 'rgba(255,255,255,0.018)');
            wisp.addColorStop(0.56, 'rgba(255,255,255,0.045)');
            wisp.addColorStop(1, 'rgba(255,255,255,0)');
            context.fillStyle = wisp;
            context.fillRect(0, 0, size, size);
        }

        context.globalCompositeOperation = 'destination-in';
        const edgeFade = context.createRadialGradient(
            center,
            center,
            center * 0.16,
            center,
            center,
            center,
        );

        edgeFade.addColorStop(0, 'rgba(255,255,255,0.94)');
        edgeFade.addColorStop(0.58, 'rgba(255,255,255,0.82)');
        edgeFade.addColorStop(1, 'rgba(255,255,255,0)');
        context.fillStyle = edgeFade;
        context.fillRect(0, 0, size, size);
        context.globalCompositeOperation = 'source-over';
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    return texture;
}

/**
 * Creates a soft Gaussian blur texture used as the ribbon map for
 * constellation connecting lines. Alpha falls off toward edges/ends.
 */
export function createLineBlurTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    const width = 192;
    const height = 48;
    const context = canvas.getContext('2d');

    canvas.width = width;
    canvas.height = height;

    if (context) {
        const image = context.createImageData(width, height);
        const data = image.data;

        for (let y = 0; y < height; y += 1) {
            const normalized = (y / (height - 1)) * 2 - 1;
            const alpha = Math.exp(-normalized * normalized * 7.5);

            for (let x = 0; x < width; x += 1) {
                const index = (y * width + x) * 4;
                const endFade = Math.sin((x / (width - 1)) * Math.PI);
                const finalAlpha = alpha * (0.32 + endFade * 0.68);

                data[index] = 255;
                data[index + 1] = 255;
                data[index + 2] = 255;
                data[index + 3] = Math.round(finalAlpha * 255);
            }
        }

        context.putImageData(image, 0, 0);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    return texture;
}
