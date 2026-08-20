import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

export function registerGsap(): void {
    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.config({
        autoRefreshEvents: 'visibilitychange,resize',
    });
}
