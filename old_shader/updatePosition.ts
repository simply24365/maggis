export const updatePositionShader = /*glsl*/`#version 300 es
precision highp float;

uniform sampler2D currentParticlesPosition;
uniform sampler2D particlesSpeed;

in vec2 v_textureCoordinates;

out vec4 fragColor;

void main() {
    // 현재 파티클의 위치 가져오기
    vec2 currentPos = texture(currentParticlesPosition, v_textureCoordinates).rg;
    // 파티클의 속도 가져오기
    vec2 speed = texture(particlesSpeed, v_textureCoordinates).rg;
    // 다음 위치 계산
    vec2 nextPos = currentPos + speed;
    
    // 새로운 위치를 fragColor에 쓰기
    fragColor = vec4(nextPos, 0.0, 1.0);
}
`;