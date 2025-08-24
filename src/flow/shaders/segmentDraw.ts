export const renderParticlesVertexShader = `#version 300 es
precision highp float;

in vec2 st;
in vec3 normal;

uniform sampler2D previousParticlesPosition;
uniform sampler2D currentParticlesPosition;
uniform sampler2D postProcessingPosition;
uniform sampler2D particlesSpeed;

uniform float frameRateAdjustment;
uniform float particleHeight;
uniform float aspect;
uniform float pixelSize;
uniform vec2 lineWidth;
uniform vec2 lineLength;
uniform vec2 domain;
uniform bool is3D;

uniform vec2 minimum; // minLon, minLat
uniform vec2 maximum; // maxLon, maxLat

out vec4 speed;
out float v_segmentPosition;
out vec2 textureCoordinate;

struct adjacentPoints {
vec4 previous;
vec4 current;
vec4 next;
};

vec3 convertCoordinate(vec2 lonLat) {
    float a = 6378137.0;
    float b = 6356752.3142;
    float e2 = 6.69437999014e-3;


    float latitude = radians(lonLat.y);
    float longitude = radians(lonLat.x);

    float cosLat = cos(latitude);
    float sinLat = sin(latitude);
    float cosLon = cos(longitude);
    float sinLon = sin(longitude);

    float N_Phi = a / sqrt(1.0 - e2 * sinLat * sinLat);
    float h = particleHeight;
    vec3 cartesian = vec3(0.0);
    cartesian.x = (N_Phi + h) * cosLat * cosLon;
    cartesian.y = (N_Phi + h) * cosLat * sinLon;
    cartesian.z = ((b * b) / (a * a) * N_Phi + h) * sinLat;
    return cartesian;

}

vec4 calculateProjectedCoordinate(vec2 lonLat) {
    if (is3D) {
        vec3 particlePosition = convertCoordinate(lonLat);
        vec4 projectedPosition = czm_modelViewProjection * vec4(particlePosition, 1.0);
        return projectedPosition;
        } else {
        vec3 position2D = vec3(radians(lonLat.x), radians(lonLat.y), 0.0);
        return czm_modelViewProjection * vec4(position2D, 1.0);
    }
}

vec4 calculateOffsetOnNormalDirection(vec4 pointA, vec4 pointB, float offsetSign, float widthFactor) {
    vec2 aspectVec2 = vec2(aspect, 1.0);
    vec2 pointA_XY = (pointA.xy / pointA.w) * aspectVec2;
    vec2 pointB_XY = (pointB.xy / pointB.w) * aspectVec2;

    vec2 direction = normalize(pointB_XY - pointA_XY);

    vec2 normalVector = vec2(-direction.y, direction.x);
    normalVector.x = normalVector.x / aspect;

    float offsetLength = widthFactor * lineWidth.y;
    normalVector = offsetLength * normalVector;

    vec4 offset = vec4(offsetSign * normalVector, 0.0, 0.0);
    return offset;

}
const float MIN_DIRECTION_PROBE_DISTANCE = 1e-5;

void main() {
    vec2 flippedIndex = vec2(st.x, 1.0 - st.y);

    vec2 particleIndex = flippedIndex;
    speed = texture(particlesSpeed, particleIndex);

    vec4 previousData = texture(previousParticlesPosition, particleIndex);
    vec4 currentData = texture(currentParticlesPosition, particleIndex);

    // Un-normalize the particle positions from [0, 1] range to actual lon/lat
    vec2 previousLonLat = mix(minimum, maximum, previousData.rg);
    vec2 currentLonLat = mix(minimum, maximum, currentData.rg);

    bool isParticleReset = currentData.a > 0.0;

    adjacentPoints projectedCoordinates;
    if (isParticleReset) {
        projectedCoordinates.previous = calculateProjectedCoordinate(currentLonLat);
        projectedCoordinates.current = projectedCoordinates.previous;
        projectedCoordinates.next = projectedCoordinates.previous;
    } else {
        projectedCoordinates.previous = calculateProjectedCoordinate(previousLonLat);
        projectedCoordinates.current = calculateProjectedCoordinate(currentLonLat);

        vec2 world_velocity = speed.rg;
        vec2 world_direction;

        // 1. Get a stable world-space direction vector.
        if (length(world_velocity) > 0.0) {
            // If there's velocity, use that direction.
            world_direction = normalize(world_velocity);
        } else {
            // If velocity is zero, use the direction from previous to current as a fallback.
            vec2 fallback_dir = currentLonLat - previousLonLat;
            if (length(fallback_dir) > 0.0) {
                world_direction = normalize(fallback_dir);
            } else {
                // If even that fails (particle is completely stationary), set an arbitrary
                // direction to prevent NaNs. The tail length will be zero anyway.
                world_direction = vec2(1.0, 0.0);
            }
        }

        // 2. Use the stable direction vector to set a 'next' position for direction calculation.
        vec2 nextPosForDirection = currentLonLat + world_direction * MIN_DIRECTION_PROBE_DISTANCE;
        projectedCoordinates.next = calculateProjectedCoordinate(nextPosForDirection);
    }

    int pointToUse = int(normal.x);
    float offsetSign = normal.y;
    vec4 offset = vec4(0.0);

    float speedLength = clamp(speed.b, domain.x, domain.y);
    float normalizedSpeed = (speedLength - domain.x) / (domain.y - domain.x);

    float widthFactor = mix(lineWidth.x, lineWidth.y, normalizedSpeed);
    widthFactor *= (pointToUse > 0 ? 1.0 : 0.7);

    // 3. Calculate tail length based on the actual speed magnitude.
    float lengthFactor = mix(lineLength.x, lineLength.y, normalizedSpeed) * pixelSize;

    if (pointToUse == 1) {
        offset = pixelSize * calculateOffsetOnNormalDirection(
            projectedCoordinates.previous,
            projectedCoordinates.current,
            offsetSign,
            widthFactor
        );
        gl_Position = projectedCoordinates.previous + offset;
        v_segmentPosition = 0.0;
    } else if (pointToUse == -1) {
        // The direction from projectedCoordinates.current -> projectedCoordinates.next is now stable.
        vec4 direction = normalize(projectedCoordinates.next - projectedCoordinates.current);
        
        // Apply the actual tail length using lengthFactor.
        vec4 extendedPosition = projectedCoordinates.current + direction * lengthFactor;

        offset = pixelSize * calculateOffsetOnNormalDirection(
            projectedCoordinates.current,
            extendedPosition,
            offsetSign,
            widthFactor
        );
        gl_Position = extendedPosition + offset;
        v_segmentPosition = 1.0;
    }

    textureCoordinate = st;
}
`;


export const renderParticlesFragmentShader = `#version 300 es
precision highp float;

in vec4 speed;
in float v_segmentPosition;
in vec2 textureCoordinate;

uniform vec2 domain;
uniform vec2 displayRange;
uniform sampler2D colorTable;
uniform sampler2D segmentsDepthTexture;

out vec4 fragColor;

void main() {
    const float zero = 0.0;
    if(speed.a > zero && speed.b > displayRange.x && speed.b < displayRange.y) {
        float speedLength = clamp(speed.b, domain.x, domain.y);
        float normalizedSpeed = (speedLength - domain.x) / (domain.y - domain.x);
        vec4 baseColor = texture(colorTable, vec2(normalizedSpeed, zero));

        float alpha = 1.0 - v_segmentPosition;
        alpha = pow(alpha, 1.5);

        float speedAlpha = mix(0.4, 1.0, normalizedSpeed);

        fragColor = vec4(baseColor.rgb, baseColor.a * alpha * speedAlpha);
    } else {
        fragColor = vec4(zero);
    }

    float segmentsDepth = texture(segmentsDepthTexture, textureCoordinate).r;
    float globeDepth = czm_unpackDepth(texture(czm_globeDepthTexture, textureCoordinate));
    if (segmentsDepth < globeDepth) {
        fragColor = vec4(zero);
    }
}
`;