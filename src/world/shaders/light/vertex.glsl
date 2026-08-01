varying vec3 vModelPos;
void main() {
    vModelPos = vec3(position.xy, 0.0);
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
