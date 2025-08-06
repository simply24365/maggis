export const postProcessingPositionFragmentShader = /*glsl*/`#version 300 es
precision highp float;

uniform sampler2D nextParticlesPosition;
uniform sampler2D particlesSpeed; // (u, v, norm)

// range (min, max)
uniform vec2 lonRange;
uniform vec2 latRange;

// range (min, max)
uniform vec2 dataLonRange;
uniform vec2 dataLatRange;

uniform float randomCoefficient;
uniform float dropRate;
uniform float dropRateBump;

// 添加新的 uniform 变量
uniform bool useViewerBounds;

in vec2 v_textureCoordinates;

// pseudo-random generator
const vec3 randomConstants = vec3(12.9898, 78.233, 4375.85453);
const vec2 normalRange = vec2(0.0, 1.0);
float rand(vec2 seed, vec2 range) {
    vec2 randomSeed = randomCoefficient * seed;
    float temp = dot(randomConstants.xy, randomSeed);
    temp = fract(sin(temp) * (randomConstants.z + temp));
    return temp * (range.y - range.x) + range.x;
}

vec2 generateRandomParticle(vec2 seed) {
    if (useViewerBounds) {
        // 在当前视域范围内生成粒子
        float randomLon = rand(seed, lonRange);
        float randomLat = rand(-seed, latRange);
        return vec2(randomLon, randomLat);
    } else {
        // 在数据范围内生成粒子
        float randomLon = rand(seed, dataLonRange);
        float randomLat = rand(-seed, dataLatRange);
        return vec2(randomLon, randomLat);
    }
}

bool particleOutbound(vec2 particle) {
    return particle.y < dataLatRange.x || particle.y > dataLatRange.y || particle.x < dataLonRange.x || particle.x > dataLonRange.y;
}

out vec4 fragColor;

void main() {
    vec2 nextParticle = texture(nextParticlesPosition, v_textureCoordinates).rg;
    vec4 nextSpeed = texture(particlesSpeed, v_textureCoordinates);
    float speedNorm = nextSpeed.a;
    float particleDropRate = dropRate + dropRateBump * speedNorm;

    vec2 seed = nextParticle.xy + v_textureCoordinates;
    float randomNumber = rand(seed, normalRange);

    if (randomNumber < particleDropRate || particleOutbound(nextParticle)) {
        // 리셋이 필요하다고 플래그만 남김 (alpha = 1.0)
        // 실제 새로운 위치 생성은 maskCheck 셰이더에 위임
        fragColor = vec4(nextParticle, 0.0, 1.0);
    } else {
        fragColor = vec4(nextParticle, 0.0, 0.0);
    }
}
`;
