export const spawnParticlesShader = /*glsl*/`#version 300 es
precision highp float;

uniform sampler2D currentParticlesPosition;
uniform sampler2D mask; // mask texture (0 = blocked, 1 = allowed)
uniform sampler2D seeds; // seeds texture for predefined spawn points

// range (min, max)
uniform vec2 dataLonRange;
uniform vec2 dataLatRange;

// Current viewer bounds (only used if useViewerBounds is true)
uniform vec2 lonRange;
uniform vec2 latRange;

uniform vec2 dimension; // (lon, lat)
uniform vec2 minimum; // minimum of each dimension  (lon min, lat min)
uniform vec2 maximum; // maximum of each dimension (lon max, lat max)

uniform float randomCoefficient;
uniform float particlesTextureSize;
uniform float t; // time uniform for randomness
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

float getMaskValue(vec2 normalizedLonLat) {
    vec2 lonLat = mix(minimum, maximum, normalizedLonLat);
    vec2 normalizedIndex2D = mapPositionToNormalizedIndex2D(lonLat);
    return texture(mask, normalizedIndex2D).r;
}

vec2 generateRandomParticle(vec2 seed) {
    // Include time in seed for temporal variation
    vec2 timeSeed = seed + vec2(t * 0.001, t * 0.0013);
    
    float seedU = rand(timeSeed, normalRange);
    float seedV = rand(-timeSeed, normalRange);
    vec2 seedTexCoord = vec2(seedU, seedV);
    
    vec4 seedData = texture(seeds, seedTexCoord);

    // Add random noise around seedData position (±0.00000001 diameter)
    float noiseRadius = 0.00000001;
    float noiseU = rand(timeSeed + vec2(1.0, 0.0), vec2(-noiseRadius, noiseRadius));
    float noiseV = rand(timeSeed + vec2(0.0, 1.0), vec2(-noiseRadius, noiseRadius));
    
    vec2 noisyPosition = seedData.rg + vec2(noiseU, noiseV);
    
    return noisyPosition;
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
        vec2 newPosition = generateRandomParticle(seed);
        fragColor = vec4(newPosition, 0.0, 1.0); // 1.0 indicates this is a reset particle
    } else {
        // Particle is in valid area, keep current position
        fragColor = vec4(currentPosition, 0.0, 0.0); // 0.0 indicates normal particle
    }
}
`;
