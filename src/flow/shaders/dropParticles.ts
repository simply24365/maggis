export const dropParticleFragmentShader = /*glsl*/`#version 300 es
precision highp float;

uniform sampler2D nextParticlesPosition;
uniform sampler2D particlesSpeed; // (u, v, norm)

// range (min, max)
uniform vec2 dataLonRange;
uniform vec2 dataLatRange;

uniform float randomCoefficient;
uniform float dropRate;
uniform float dropRateBump;

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

out vec4 fragColor;

void main() {
    vec2 nextParticle = texture(nextParticlesPosition, v_textureCoordinates).rg;
    vec4 nextSpeed = texture(particlesSpeed, v_textureCoordinates);
    float speedNorm = nextSpeed.a;
    float particleDropRate = dropRate + dropRateBump * speedNorm;

    vec2 seed = nextParticle.xy + v_textureCoordinates;
    float randomNumber = rand(seed, normalRange);

    if (randomNumber < particleDropRate) {
        // Only set reset flag (alpha = 1.0), actual position generation delegated to spawn shader
        fragColor = vec4(nextParticle, 0.0, 1.0);
    } else {
        fragColor = vec4(nextParticle, 0.0, 0.0);
    }
}
`;
