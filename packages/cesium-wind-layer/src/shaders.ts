export const calculateSpeedShader = /*glsl*/`#version 300 es
precision highp float;

uniform sampler2D U;
uniform sampler2D V;
uniform sampler2D currentParticlesPosition;
uniform float speedScaleFactor;

in vec2 v_textureCoordinates;

vec2 mapPositionToNormalizedIndex2D(vec2 lonLat) {
    // Map longitude from [-180, 180] to [0, 1]
    float x = (lonLat.x + 180.0) / 360.0;
    // Map latitude from [-90, 90] to [0, 1]
    float y = (lonLat.y + 90.0) / 180.0;
    return vec2(x, y);
}

float getWindComponent(sampler2D windTexture, vec2 lonLat) {
    vec2 normalizedIndex2D = mapPositionToNormalizedIndex2D(lonLat);
    return texture(windTexture, normalizedIndex2D).r;
}

vec2 getWindVector(vec2 lonLat) {
    return vec2(
        getWindComponent(U, lonLat),
        getWindComponent(V, lonLat)
    );
}

out vec4 fragColor;

void main() {
    vec2 lonLat = texture(currentParticlesPosition, v_textureCoordinates).rg;
    vec2 windVector = getWindVector(lonLat);
    float windSpeed = length(windVector);
    
    // Use windVector directly since textures are normalized
    float u = windVector.x;
    float v = windVector.y;
    
    fragColor = vec4(u, v, 0.0, windSpeed);
}
`;

export const updatePositionShader = /*glsl*/`#version 300 es
precision highp float;

uniform sampler2D currentParticlesPosition;
uniform sampler2D particlesSpeed;

in vec2 v_textureCoordinates;

out vec4 fragColor;

void main() {
    // texture coordinate must be normalized
    vec2 lonLat = texture(currentParticlesPosition, v_textureCoordinates).rg;
    vec4 speed = texture(particlesSpeed, v_textureCoordinates).rgba;
    vec2 nextParticle = lonLat + speed.rg;
    if(speed.a > 0.0) {
      fragColor = vec4(nextParticle, 0.0);
    } else {
      fragColor = vec4(0.0);
    }
}
`;

export const renderParticlesVertexShader = /*glsl*/`#version 300 es
precision highp float;

in vec2 st;
// it is not normal itself, but used to control lines drawing
in vec3 normal; // (point to use, offset sign, not used component)

uniform sampler2D previousParticlesPosition;
uniform sampler2D currentParticlesPosition;
uniform sampler2D postProcessingPosition;
uniform sampler2D particlesSpeed;

uniform float particleHeight;

uniform float aspect;
uniform float pixelSize;
uniform float lineWidth;

struct adjacentPoints {
    vec4 previous;
    vec4 current;
    vec4 next;
};

out float speedNormalization;
vec3 convertCoordinate(vec2 lonLat) {
    // WGS84 (lon, lat, lev) -> ECEF (x, y, z)
    // read https://en.wikipedia.org/wiki/Geographic_coordinate_conversion#From_geodetic_to_ECEF_coordinates for detail

    // WGS 84 geometric constants
    float a = 6378137.0; // Semi-major axis
    float b = 6356752.3142; // Semi-minor axis
    float e2 = 6.69437999014e-3; // First eccentricity squared

    float latitude = radians(lonLat.y);
    float longitude = radians(lonLat.x);

    float cosLat = cos(latitude);
    float sinLat = sin(latitude);
    float cosLon = cos(longitude);
    float sinLon = sin(longitude);

    float N_Phi = a / sqrt(1.0 - e2 * sinLat * sinLat);
    float h = particleHeight; // it should be high enough otherwise the particle may not pass the terrain depth test
    vec3 cartesian = vec3(0.0);
    cartesian.x = (N_Phi + h) * cosLat * cosLon;
    cartesian.y = (N_Phi + h) * cosLat * sinLon;
    cartesian.z = ((b * b) / (a * a) * N_Phi + h) * sinLat;
    return cartesian;
}

vec4 calculateProjectedCoordinate(vec2 lonLat) {
    // the range of longitude in Cesium is [-180, 180] but the range of longitude in the NetCDF file is [0, 360]
    // [0, 180] is corresponding to [0, 180] and [180, 360] is corresponding to [-180, 0]
    lonLat.x = mod(lonLat.x + 180.0, 360.0) - 180.0;
    vec3 particlePosition = convertCoordinate(lonLat);
    vec4 projectedCoordinate = czm_modelViewProjection * vec4(particlePosition, 1.0);
    return projectedCoordinate;
}

vec4 calculateOffsetOnNormalDirection(vec4 pointA, vec4 pointB, float offsetSign) {
    vec2 aspectVec2 = vec2(aspect, 1.0);
    vec2 pointA_XY = (pointA.xy / pointA.w) * aspectVec2;
    vec2 pointB_XY = (pointB.xy / pointB.w) * aspectVec2;

    float offsetLength = lineWidth / 2.0;
    vec2 direction = normalize(pointB_XY - pointA_XY);
    vec2 normalVector = vec2(-direction.y, direction.x);
    normalVector.x = normalVector.x / aspect;
    normalVector = offsetLength * normalVector;

    vec4 offset = vec4(offsetSign * normalVector, 0.0, 0.0);
    return offset;
}

void main() {
    vec2 particleIndex = st;

    vec2 previousPosition = texture(previousParticlesPosition, particleIndex).rg;
    vec2 currentPosition = texture(currentParticlesPosition, particleIndex).rg;
    vec2 nextPosition = texture(postProcessingPosition, particleIndex).rg;

    float isAnyRandomPointUsed = texture(postProcessingPosition, particleIndex).a +
        texture(currentParticlesPosition, particleIndex).a +
        texture(previousParticlesPosition, particleIndex).a;

    adjacentPoints projectedCoordinates;
    if (isAnyRandomPointUsed > 0.0) {
        projectedCoordinates.previous = calculateProjectedCoordinate(previousPosition);
        projectedCoordinates.current = projectedCoordinates.previous;
        projectedCoordinates.next = projectedCoordinates.previous;
    } else {
        projectedCoordinates.previous = calculateProjectedCoordinate(previousPosition);
        projectedCoordinates.current = calculateProjectedCoordinate(currentPosition);
        projectedCoordinates.next = calculateProjectedCoordinate(nextPosition);
    }

    int pointToUse = int(normal.x);
    float offsetSign = normal.y;
    vec4 offset = vec4(0.0);
    // render lines with triangles and miter joint
    // read https://blog.scottlogic.com/2019/11/18/drawing-lines-with-webgl.html for detail
    if (pointToUse == -1) {
        offset = pixelSize * calculateOffsetOnNormalDirection(projectedCoordinates.previous, projectedCoordinates.current, offsetSign);
        gl_Position = projectedCoordinates.previous + offset;
    } else  if (pointToUse == 1) {
        offset = pixelSize * calculateOffsetOnNormalDirection(projectedCoordinates.current, projectedCoordinates.next, offsetSign);
        gl_Position = projectedCoordinates.next + offset;
    }

    speedNormalization = texture(particlesSpeed, particleIndex).a;
}
`;

export const renderParticlesFragmentShader = /*glsl*/`#version 300 es
uniform sampler2D colorTable;

in float speedNormalization;

out vec4 fragColor;

void main() {
  const float zero = 0.0;
  if(speedNormalization > zero){
    fragColor = texture(colorTable, vec2(speedNormalization, zero));
  } else {
    fragColor = vec4(zero);
  }
}

`;

export const fullscreenQuadVertexShader = /*glsl*/`#version 300 es

in vec3 position;
in vec2 st;

out vec2 textureCoordinate;

void main() {
    textureCoordinate = st;
    gl_Position = vec4(position, 1.0);
}
`;

export const trailDrawFragmentShader = /*glsl*/`#version 300 es
precision highp float;

in vec2 textureCoordinate;

uniform sampler2D segmentsColorTexture;
uniform sampler2D segmentsDepthTexture;

uniform sampler2D currentTrailsColor;
uniform sampler2D trailsDepthTexture;

uniform float fadeOpacity;

out vec4 fragColor;
void main() {
    vec4 pointsColor = texture(segmentsColorTexture, textureCoordinate);
    vec4 trailsColor = texture(currentTrailsColor, textureCoordinate);
    trailsColor = floor(fadeOpacity * 255.0 * trailsColor) / 255.0; // make sure the trailsColor will be strictly decreased

    float pointsDepth = texture(segmentsDepthTexture, textureCoordinate).r;
    float trailsDepth = texture(trailsDepthTexture, textureCoordinate).r;
    float globeDepth = czm_unpackDepth(texture(czm_globeDepthTexture, textureCoordinate));
    fragColor = vec4(0.0);
    if (pointsDepth < globeDepth) {
        fragColor = fragColor + pointsColor;
    }
    if (trailsDepth < globeDepth) {
        fragColor = fragColor + trailsColor;
    }
    gl_FragDepth = min(pointsDepth, trailsDepth);
}
`;

export const postProcessingPositionFragmentShader = /*glsl*/`#version 300 es
precision highp float;

uniform sampler2D nextParticlesPosition;
uniform sampler2D particlesSpeed; // (u, v, 0, norm)

// range (min, max)
uniform vec2 lonRange;
uniform vec2 latRange;
uniform vec2 viewerLonRange;
uniform vec2 viewerLatRange;

const float randomCoefficient = 0.1; // use to improve the pseudo-random generator
const float dropRate = 0.1; // drop rate is a chance a particle will restart at random position to avoid degeneration
const float dropRateBump = 0.1;

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

vec3 generateRandomParticle(vec2 seed) {
    // ensure the longitude is in [0, 360]
    float randomLon = mod(rand(seed, lonRange), 360.0);
    float randomLat = rand(-seed, latRange);

    return vec3(randomLon, randomLat, 0);
}

bool particleOutbound(vec3 particle) {
    return particle.y < viewerLatRange.x || particle.y > viewerLatRange.y || particle.x < viewerLonRange.x || particle.x > viewerLonRange.y;
}

out vec4 fragColor;

void main() {
    vec3 nextParticle = texture(nextParticlesPosition, v_textureCoordinates).rgb;
    vec4 nextSpeed = texture(particlesSpeed, v_textureCoordinates);
    float speedNorm = nextSpeed.a;
    float particleDropRate = dropRate + dropRateBump * speedNorm;

    vec2 seed1 = nextParticle.xy + v_textureCoordinates;
    vec2 seed2 = nextSpeed.xy + v_textureCoordinates;
    vec3 randomParticle = generateRandomParticle(seed1);
    float randomNumber = rand(seed2, normalRange);

    if (randomNumber < particleDropRate || particleOutbound(nextParticle)) {
        fragColor = vec4(randomParticle, 1.0); // 1.0 means this is a random particle
    } else {
        fragColor = vec4(nextParticle, 0.0);
    }
}
`;

export const screenDrawFragmentShader = /*glsl*/`#version 300 es

uniform sampler2D trailsColorTexture;
uniform sampler2D trailsDepthTexture;

in vec2 textureCoordinate;
out vec4 fragColor;

void main() {
    vec4 trailsColor = texture(trailsColorTexture, textureCoordinate);
    float trailsDepth = texture(trailsDepthTexture, textureCoordinate).r;
    float globeDepth = czm_unpackDepth(texture(czm_globeDepthTexture, textureCoordinate));

    if (trailsDepth < globeDepth) {
        fragColor = trailsColor;
    } else {
        fragColor = vec4(0.0);
    }
}
`;
