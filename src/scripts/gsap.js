import { TweenMax, Power3 } from "gsap/all";

TweenMax.to(".intro", 2, {
    scrollTrigger: ".intro",
    opacity: ".8",
    ease: Power3.easeOut
});
