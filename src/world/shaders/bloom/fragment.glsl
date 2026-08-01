uniform sampler2D baseTexture;
uniform sampler2D bloomTexture;

varying vec2 vUv;

void main() {
    vec4 baseColor = texture2D(baseTexture, vUv);
    vec3 bloomColor = texture2D(bloomTexture, vUv).rgb;

    gl_FragColor = vec4(baseColor.rgb + bloomColor, baseColor.a);
}