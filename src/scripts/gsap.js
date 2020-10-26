import { gsap, ScrollTrigger, ScrollToPlugin } from "gsap/all";

const animateMarks = () => gsap.to(".landing-section__mark-icon", {
	duration: 0.5,
	ease: "none",
	x: "+=100%",
	modifiers: {
		x: gsap.utils.unitize(x => parseFloat(x) % 100, "%")
	},
	repeat: -1
});

gsap.registerPlugin(ScrollTrigger);
gsap.registerPlugin(ScrollToPlugin);

gsap.to("section:not(:last-of-type)", {
	scrollTrigger: {
		trigger: ".container",
		start: "top top",
		end: "top bottom",
		pin: true
	}
});

const initialScrollTo = window.location.hash;
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
		// Uncomment below to enable debugging
		// markers: true,
		onLeave: () => {
			if (navLinks[i + 1]) {
				gsap.set(navLinks[i + 1], {
					color: "dodgerblue",
					fontWeight: 900
				});
				gsap.set(navLinks[i], {
					color: "white",
					fontWeight: 100
				});
			}
		},
		onEnterBack: () => {
			gsap.set(navLinks[i], {
				color: "dodgerblue",
				fontWeight: 900
			});
			if (navLinks[i + 1]) {
				gsap.set(navLinks[i + 1], {
					color: "white",
					fontWeight: 100
				});
			}
		},
	});
});

export {
	animateMarks
};
