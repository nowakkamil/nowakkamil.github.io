import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrollSmoother } from 'gsap/ScrollSmoother';
import { SplitText } from 'gsap/SplitText';

export function registerGsap(): void {
    gsap.registerPlugin(ScrollTrigger, ScrollSmoother, SplitText);
}
