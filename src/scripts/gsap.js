import { gsap, TimelineMax, Power3 } from "gsap/all";

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

export {
	animateMarks
};
