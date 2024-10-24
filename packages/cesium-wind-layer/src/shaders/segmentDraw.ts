export const renderParticlesVertexShader = /*glsl*/`#version 300 es
precision highp float;

in vec2 st;
in vec3 normal;

uniform sampler2D previousParticlesPosition;
uniform sampler2D currentParticlesPosition;
uniform sampler2D postProcessingPosition;
uniform sampler2D particlesSpeed;

uniform float particleHeight;
uniform float aspect;
uniform float pixelSize;
uniform float lineWidth;
uniform bool is3D; // 新增: 用于区分2D和3D模式

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
    if (is3D) {
        vec3 particlePosition = convertCoordinate(lonLat);
        // 使用 modelViewProjection 矩阵进行投影变换
        vec4 projectedPosition = czm_modelViewProjection * vec4(particlePosition, 1.0);
        return projectedPosition;
    } else {
        vec3 position2D = vec3(radians(lonLat.x), radians(lonLat.y), 0.0);
        return czm_modelViewProjection * vec4(position2D, 1.0);
    }
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
    // 翻转 Y 轴坐标
    vec2 flippedIndex = vec2(st.x, 1.0 - st.y);
    
    vec2 particleIndex = flippedIndex;

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
    } else if (pointToUse == 1) {
        offset = pixelSize * calculateOffsetOnNormalDirection(projectedCoordinates.current, projectedCoordinates.next, offsetSign);
        gl_Position = projectedCoordinates.next + offset;
    }

    speedNormalization = texture(particlesSpeed, particleIndex).b;
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
