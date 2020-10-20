import '../styles/index.scss';
import { animateMarks } from '../scripts/gsap';
import '@iconfu/svg-inject';
import { CSSPlugin } from "gsap/all";

// Prevent the webpack from performing tree shaking
const plugin = CSSPlugin;

const getSvgNode = () => {
    let svg = document.createElement('img');
    return Object.assign(svg, {
        className: 'landing-section__mark-icon',
        src: 'public/icon-code.svg',
        onload: () => SVGInject(svg)
    });
};

let svgNodes = document.createDocumentFragment();

for (let i = 0; i < 30; i++) {
    let svgNode = getSvgNode();
    svgNodes.appendChild(svgNode);
}

document.querySelector(".landing-section__mark")
    .appendChild(svgNodes);

window.mutationObserver = new MutationObserver(function (mutations, observer) {
    let i = 0;

    mutations.forEach(function (mutation) {
        console.log(mutation);
        i++;
    });

    console.log(i);

    if (i === 30) {
        animateMarks();
        delete window.mutationObserver;
        observer.disconnect();
        stop(); // TODO: Verify if needed
    }
});

mutationObserver.observe(document.querySelector(".landing-section__mark"), { subtree: true, childList: true });

const stop = () => mutationObserver.disconnect();

setTimeout(() => {
    mutationObserver.disconnect();
    console.log(mutationObserver);
}, 4000);
