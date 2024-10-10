export const postProcessingPositionFragmentShader = /*glsl*/`#version 300 es
precision highp float;

uniform sampler2D nextParticlesPosition;
uniform sampler2D particlesSpeed; // (u, v, norm)

uniform vec2 dimension; // (lon, lat)
uniform vec2 minimum; // minimum of each dimension
uniform vec2 maximum; // maximum of each dimension
uniform vec2 interval; // interval of each dimension

// range (min, max)
uniform vec2 lonRange;
uniform vec2 latRange;

uniform float randomCoefficient;
uniform float dropRate;
uniform float dropRateBump;

in vec2 v_textureCoordinates;

vec2 mapPositionToNormalizedIndex2D(vec2 lonLat) {
    // ensure the range of longitude and latitude
    lonLat.x = clamp(lonLat.x, minimum.x, maximum.x);
    lonLat.y = clamp(lonLat.y,  minimum.y, maximum.y);

    vec2 index2D = vec2(0.0);
    index2D.x = (lonLat.x - minimum.x) / interval.x;
    index2D.y = (lonLat.y - minimum.y) / interval.y;

    vec2 normalizedIndex2D = vec2(index2D.x / dimension.x, index2D.y / dimension.y);
    return normalizedIndex2D;
}

vec4 getTextureValue(sampler2D componentTexture, vec2 lonLat) {
    vec2 normalizedIndex2D = mapPositionToNormalizedIndex2D(lonLat);
    vec4 result = texture(componentTexture, normalizedIndex2D);
    return result;
}

// pseudo-random generator
const vec3 randomConstants = vec3(12.9898, 78.233, 4375.85453);
const vec2 normalRange = vec2(0.0, 1.0);
float rand(vec2 seed, vec2 range) {
    vec2 randomSeed = randomCoefficient * seed;
    float temp = dot(randomConstants.xy, randomSeed);
    temp = fract(sin(temp) * (randomConstants.z + temp));
    return temp * (range.y - range.x) + range.x;
}

bool particleNoSpeed(vec2 particle) {
    vec4 speed = getTextureValue(particlesSpeed, particle);
    return speed.r == 0.0 && speed.g == 0.0;
}

vec2 generateRandomParticle(vec2 seed) {
    float randomLon = rand(seed, lonRange);
    float randomLat = rand(-seed, latRange);

    return vec2(randomLon, randomLat);
}

bool particleOutbound(vec2 particle) {
    return particle.y < latRange.x || particle.y > latRange.y || particle.x < lonRange.x || particle.x > lonRange.y;
}

out vec4 fragColor;

void main() {
    vec2 nextParticle = texture(nextParticlesPosition, v_textureCoordinates).rg;
    vec3 nextSpeed = texture(particlesSpeed, v_textureCoordinates).rgb;
    float speedNorm = nextSpeed.b;
    float particleDropRate = dropRate + dropRateBump * speedNorm;

    vec2 seed1 = nextParticle.xy + v_textureCoordinates;
    vec2 seed2 = nextSpeed.xy + v_textureCoordinates;
    vec2 randomParticle = generateRandomParticle(seed1);
    float randomNumber = rand(seed2, normalRange);

    if (randomNumber < particleDropRate || particleOutbound(nextParticle) || particleNoSpeed(nextParticle)) {
        fragColor = vec4(randomParticle, 0.0, 1.0); // 1.0 means this is a random particle
    } else {
        fragColor = vec4(nextParticle, 0.0, 0.0);
    }
}
`;