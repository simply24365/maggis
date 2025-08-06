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
uniform vec2 lineWidth;
uniform vec2 lineLength;
uniform vec2 domain;
uniform bool is3D;

// 添加输出变量传递给片元着色器
out vec4 speed;
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
    float offsetLength = widthFactor * lineWidth.y;
    normalVector = offsetLength * normalVector;

    vec4 offset = vec4(offsetSign * normalVector, 0.0, 0.0);
    return offset;
}

void main() {
    // 翻转 Y 轴坐标
    vec2 flippedIndex = vec2(st.x, 1.0 - st.y);

    vec2 particleIndex = flippedIndex;
    speed = texture(particlesSpeed, particleIndex);

    vec4 previousData = texture(previousParticlesPosition, particleIndex);
    vec4 currentData = texture(currentParticlesPosition, particleIndex);
    
    vec2 previousPosition = previousData.rg;
    vec2 currentPosition = currentData.rg;

    // 가장 정확한 최신 리셋 정보는 currentParticlesPosition.a에 저장되어 있음
    // maskCheck 셰이더가 최종 처리한 결과가 핑퐁으로 currentParticlesPosition이 됨
    bool isParticleReset = currentData.a > 0.0;

    adjacentPoints projectedCoordinates;
    if (isParticleReset) {
        // 파티클이 리셋되었다면, 모든 좌표를 새로운 시작점(currentPosition)으로 통일
        projectedCoordinates.previous = calculateProjectedCoordinate(currentPosition);
        projectedCoordinates.current = projectedCoordinates.previous;
        projectedCoordinates.next = projectedCoordinates.previous;
    } else {
        projectedCoordinates.previous = calculateProjectedCoordinate(previousPosition);
        projectedCoordinates.current = calculateProjectedCoordinate(currentPosition);
        // 다음 위치는 현재 위치에서 속도만큼 나아간 지점으로 추정
        vec2 nextPosition = currentPosition + speed.rg;
        projectedCoordinates.next = calculateProjectedCoordinate(nextPosition);
    }

    int pointToUse = int(normal.x);
    float offsetSign = normal.y;
    vec4 offset = vec4(0.0);

    // 计算速度相关的宽度和长度因子
    float speedLength = clamp(speed.b, domain.x, domain.y);
    float normalizedSpeed = (speedLength - domain.x) / (domain.y - domain.x);
    
    // 根据速度计算宽度
    float widthFactor = mix(lineWidth.x, lineWidth.y, normalizedSpeed);
    
    // [개선] 머리(1.0)가 꼬리(0.7)보다 넓도록 하여 유선형 모양 생성
    // pointToUse > 0 은 머리 부분, pointToUse < 0 은 꼬리 부분
    widthFactor *= (pointToUse > 0 ? 1.0 : 0.7);

    // Calculate length based on speed
    float lengthFactor = mix(lineLength.x, lineLength.y, normalizedSpeed) * pixelSize;

    if (pointToUse == 1) {
        // 머리 부분 (previous -> current 방향)
        offset = pixelSize * calculateOffsetOnNormalDirection(
            projectedCoordinates.previous,
            projectedCoordinates.current,
            offsetSign,
            widthFactor
        );
        gl_Position = projectedCoordinates.previous + offset;
        v_segmentPosition = 0.0; // 머리는 0.0
    } else if (pointToUse == -1) {
        // 꼬리 부분 (current -> next 방향으로 연장)
        vec4 direction = normalize(projectedCoordinates.next - projectedCoordinates.current);
        vec4 extendedPosition = projectedCoordinates.current + direction * lengthFactor;

        offset = pixelSize * calculateOffsetOnNormalDirection(
            projectedCoordinates.current,
            extendedPosition,
            offsetSign,
            widthFactor
        );
        gl_Position = extendedPosition + offset;
        v_segmentPosition = 1.0; // 꼬리는 1.0
    }

    textureCoordinate = st;
}
`;

export const renderParticlesFragmentShader = /*glsl*/`#version 300 es
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

        // [개선] 파티클이 머리(0.0)에서 꼬리(1.0)로 갈수록 흐려지도록 수정 (fade-out 효과)
        float alpha = 1.0 - v_segmentPosition;
        alpha = pow(alpha, 1.5); // 꼬리 부분의 투명도를 더 급격하게 만들어 뾰족한 느낌을 줌

        // 속도가 빠를수록 더 진하게 보이도록 조정
        float speedAlpha = mix(0.4, 1.0, normalizedSpeed);

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
