import gsap from 'gsap';
import * as THREE from 'three';

export const rangeProgress = (progress: number, start: number, end: number): number =>
    gsap.utils.clamp(0, 1, (progress - start) / (end - start));

export const smoothstep = (value: number): number => value * value * (3 - 2 * value);

export const ease = (value: number): number => Math.pow(smoothstep(value), 0.85);

export const clamp01 = (value: number): number => THREE.MathUtils.clamp(value, 0, 1);

export const easeOutCubic = (value: number): number => 1 - Math.pow(1 - value, 3);

export const easeOutQuart = (value: number): number => 1 - Math.pow(1 - value, 4);

export const easeOutQuint = (value: number): number => 1 - Math.pow(1 - value, 5);

export const smootherstep = (value: number): number =>
    value * value * value * (value * (value * 6 - 15) + 10);
