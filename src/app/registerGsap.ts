import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

export function registerGsap(): void {
    gsap.registerPlugin(ScrollTrigger);
}
