export const renderParticlesVertexShader = /*glsl*/`#version 300 es
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
uniform float lineWidth;
uniform bool is3D;

// 添加输出变量传递给片元着色器
out vec2 speed;
out float v_segmentPosition;
out vec2 textureCoordinate;

// 添加结构体定义
struct adjacentPoints {
    vec4 previous;
    vec4 current;
    vec4 next;
};

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

vec4 calculateOffsetOnNormalDirection(vec4 pointA, vec4 pointB, float offsetSign, float widthFactor) {
    vec2 aspectVec2 = vec2(aspect, 1.0);
    vec2 pointA_XY = (pointA.xy / pointA.w) * aspectVec2;
    vec2 pointB_XY = (pointB.xy / pointB.w) * aspectVec2;

    // 计算方向向量
    vec2 direction = normalize(pointB_XY - pointA_XY);

    // 计算法向量
    vec2 normalVector = vec2(-direction.y, direction.x);
    normalVector.x = normalVector.x / aspect;

    // 使用 widthFactor 调整宽度
    float offsetLength = lineWidth * widthFactor;
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

    // 计算速度相关的宽度和长度因子
    float speedFactor = max(0.3, speed.y);
    float widthFactor = pointToUse < 0 ? 1.0 : 0.5; // 头部更宽，尾部更窄

    // Modify length calculation with constraints
    float baseLengthFactor = 10.0;
    float speedBasedLength = baseLengthFactor * speedFactor;
    float lengthFactor = clamp(speedBasedLength, 10.0, 100.0) / frameRateAdjustment;

    if (pointToUse == 1) {
        // 头部位置
        offset = pixelSize * calculateOffsetOnNormalDirection(
            projectedCoordinates.previous,
            projectedCoordinates.current,
            offsetSign,
            widthFactor * speedFactor
        );
        gl_Position = projectedCoordinates.previous + offset;
        v_segmentPosition = 0.0; // 头部
    } else if (pointToUse == -1) {
        // 尾部位置，向后延伸，使用受限制的长度
        vec4 direction = projectedCoordinates.next - projectedCoordinates.current;
        vec4 extendedPosition = projectedCoordinates.current + direction * lengthFactor;

        offset = pixelSize * calculateOffsetOnNormalDirection(
            projectedCoordinates.current,
            extendedPosition,
            offsetSign,
            widthFactor * speedFactor
        );
        gl_Position = extendedPosition + offset;
        v_segmentPosition = 1.0; // 尾部
    }

    speed = texture(particlesSpeed, particleIndex).ba;
    textureCoordinate = st;
}
`;

export const renderParticlesFragmentShader = /*glsl*/`#version 300 es
precision highp float;

in vec2 speed;
in float v_segmentPosition;
in vec2 textureCoordinate;

uniform vec2 domain;
uniform vec2 displayRange;
uniform sampler2D colorTable;
uniform sampler2D segmentsDepthTexture;

out vec4 fragColor;

void main() {
    const float zero = 0.0;
    if(speed.y > zero && speed.x > displayRange.x && speed.x < displayRange.y) {
        float speedLength = clamp(speed.x, domain.x, domain.y);
        float normalizedSpeed = (speedLength - domain.x) / (domain.y - domain.x);
        vec4 baseColor = texture(colorTable, vec2(normalizedSpeed, zero));

        // 使用更平滑的渐变效果
        float alpha = smoothstep(0.0, 1.0, v_segmentPosition);
        alpha = pow(alpha, 1.5); // 调整透明度渐变曲线

        // 根据速度调整透明度
        float speedAlpha = mix(0.3, 1.0, speed.y);

        // 组合颜色和透明度
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
