export const maskCheckShader = /*glsl*/`#version 300 es
precision highp float;

uniform sampler2D currentParticlesPosition;
uniform sampler2D mask; // mask texture (0 = blocked, 1 = allowed)

// range (min, max)
uniform vec2 dataLonRange;
uniform vec2 dataLatRange;

uniform vec2 dimension; // (lon, lat)
uniform vec2 minimum; // minimum of each dimension
uniform vec2 maximum; // maximum of each dimension

uniform float randomCoefficient;

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

vec2 getInterval(vec2 maximum, vec2 minimum, vec2 dimension) {
    return (maximum - minimum) / (dimension - 1.0);
}

vec2 mapPositionToNormalizedIndex2D(vec2 lonLat) {
    // ensure the range of longitude and latitude
    lonLat.x = clamp(lonLat.x, minimum.x, maximum.x);
    lonLat.y = clamp(lonLat.y, minimum.y, maximum.y);

    vec2 interval = getInterval(maximum, minimum, dimension);
    
    vec2 index2D = vec2(0.0);
    index2D.x = (lonLat.x - minimum.x) / interval.x;
    index2D.y = (lonLat.y - minimum.y) / interval.y;

    vec2 normalizedIndex2D = vec2(index2D.x / dimension.x, index2D.y / dimension.y);
    return normalizedIndex2D;
}

float getMaskValue(vec2 lonLat) {
    vec2 normalizedIndex2D = mapPositionToNormalizedIndex2D(lonLat);
    return texture(mask, normalizedIndex2D).r;
}

vec2 generateValidRandomParticle(vec2 seed) {
    // Generate random particles within data bounds until we find a valid one
    // In practice, we'll limit attempts to avoid infinite loops
    const int maxAttempts = 20;
    
    for (int i = 0; i < maxAttempts; i++) {
        vec2 randomSeed = seed + float(i) * 0.1;
        float randomLon = rand(randomSeed, dataLonRange);
        float randomLat = rand(-randomSeed, dataLatRange);
        vec2 testPosition = vec2(randomLon, randomLat);
        
        float maskValue = getMaskValue(testPosition);
        if (maskValue > 0.5) { // Valid position (mask value > 0.5 means allowed)
            return testPosition;
        }
    }
    
    // Fallback: return center of data bounds if no valid position found
    return vec2(
        (dataLonRange.x + dataLonRange.y) * 0.5,
        (dataLatRange.x + dataLatRange.y) * 0.5
    );
}

out vec4 fragColor;

void main() {
    vec4 particleData = texture(currentParticlesPosition, v_textureCoordinates);
    vec2 currentPosition = particleData.rg;
    float isResetFromPreviousPass = particleData.a;
    
    // Check if current position is in a masked area
    float maskValue = getMaskValue(currentPosition);
    
    if (isResetFromPreviousPass > 0.0 || maskValue < 0.5) {
        // Particle was reset in previous pass OR is in blocked area
        // Generate new valid random position
        vec2 seed = currentPosition + v_textureCoordinates;
        vec2 newPosition = generateValidRandomParticle(seed);
        fragColor = vec4(newPosition, 0.0, 1.0); // 1.0 indicates this is a reset particle
    } else {
        // Particle is in valid area, keep current position
        fragColor = vec4(currentPosition, 0.0, 0.0); // 0.0 indicates normal particle
    }
}
`;
