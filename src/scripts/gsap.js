import { gsap, TimelineMax, Power3, ScrollTrigger, ScrollToPlugin } from "gsap/all";

const animateMarks = () => {
	let marks = document.querySelectorAll(".landing-section__mark-icon");
	let mark = document.querySelector(".landing-section__mark-icon");
	let tl = new TimelineMax();

	gsap.to(".landing-section__mark-icon", {
		duration: 0.5,
		ease: "none",
		x: "+=100%", // move each box 500px to right
		modifiers: {
			x: gsap.utils.unitize(x => {
				return parseFloat(x) % 100;
			}, "%") // force x value to be between 0 and 500 using modulus
		},
		repeat: -1
	});

	// setTimeout() is crucial
};

gsap.registerPlugin(ScrollTrigger);
gsap.registerPlugin(ScrollToPlugin);

gsap.to(".section:not(:last-child)", {
	scrollTrigger: {
		trigger: ".container",
		start: "top top",
		end: "top bottom",
		pin: true
	}
});

let initialScrollTo = window.location.hash;
if (initialScrollTo) {
	gsap.to(window, { scrollTo: initialScrollTo });
}

const navLinks = gsap.utils.toArray(".nav__link-wrapper a");
navLinks.forEach((link, i) => {
	link.addEventListener("click", e => {
		e.preventDefault();
		console.log(i * innerHeight);
		gsap.to(window, { scrollTo: i * innerHeight });
	});
});

const sections = gsap.utils.toArray("section");
sections.forEach((section, i) => {
	ScrollTrigger.create({
		start: 0,
		end: (i + 1) * innerHeight - innerHeight / 2,
		// markers: true,
		onLeave: () => {
			if (navLinks[i + 1]) {
				gsap.to(navLinks[i + 1], { scale: 1.3, color: "grey" });
				gsap.to(navLinks[i], { scale: 1, color: "white" });
			}
		},
		onEnterBack: () => {
			gsap.to(navLinks[i], { scale: 1.3, color: "grey" });
			if (navLinks[i + 1]) {
				gsap.to(navLinks[i + 1], { scale: 1, color: "white" });
			}
		},
	});
});

export {
	animateMarks
};
