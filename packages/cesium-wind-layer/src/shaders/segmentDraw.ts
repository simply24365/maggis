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
uniform vec3 cameraPosition;
uniform vec3 cameraDirection;
uniform vec3 cameraUp;
uniform float cameraDistance;

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

    // 카메라 각도에 따른 적응적 두께 조정
    float viewAngleFactor = 1.0;
    if (is3D) {
        // 3D 모드에서 카메라 뷰와 파티클 방향의 관계 계산
        vec2 screenDirection = normalize(pointB_XY - pointA_XY);
        
        // 정면에서 볼 때(screenDirection가 짧거나 거의 0에 가까울 때) 더 두껍게
        float directionLength = length(pointB_XY - pointA_XY);
        
        // 방향의 길이가 짧을수록(정면에서 볼 때) 더 두껍게
        // 방향의 길이가 길수록(측면에서 볼 때) 상대적으로 얇게
        float lengthFactor = clamp(directionLength, 0.01, 1.0);
        viewAngleFactor = mix(3.0, 1.0, lengthFactor); // 정면일 때 3배, 측면일 때 1배
        
        // 카메라 거리에 따른 추가 스케일 조정
        float distanceFactor = clamp(cameraDistance / 10000000.0, 0.8, 2.5);
        viewAngleFactor *= distanceFactor;
        
        // 최소/최대 두께 제한
        viewAngleFactor = clamp(viewAngleFactor, 0.5, 4.0);
    }

    // 使用 widthFactor와 viewAngleFactor 조정宽度
    float offsetLength = widthFactor * lineWidth.y * viewAngleFactor;
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
        vec2 nextPosition = currentPosition + speed.rg * 10.;
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
    widthFactor *= (pointToUse < 0 ? 1.0 : 0.5); // 头部更宽，尾部更窄

    // 카메라 거리와 각도를 고려한 길이 계산
    float lengthFactor = mix(lineLength.x, lineLength.y, normalizedSpeed) * pixelSize;
    if (is3D) {
        // 카메라 거리에 따른 길이 조정
        float distanceScale = clamp(cameraDistance / 10000000.0, 0.3, 2.0);
        lengthFactor *= distanceScale;
        
        // 속도가 높을수록 더 긴 꼬리
        lengthFactor *= (1.0 + normalizedSpeed * 0.5);
    }

    if (pointToUse == 1) {
        // 头部位置
        offset = pixelSize * calculateOffsetOnNormalDirection(
            projectedCoordinates.previous,
            projectedCoordinates.current,
            offsetSign,
            widthFactor
        );
        gl_Position = projectedCoordinates.previous + offset;
        v_segmentPosition = 0.0; // 头部
    } else if (pointToUse == -1) {
        // Get direction and normalize it to length 1.0
        vec4 direction = normalize(projectedCoordinates.next - projectedCoordinates.current);
        vec4 extendedPosition = projectedCoordinates.current + direction * lengthFactor;

        offset = pixelSize * calculateOffsetOnNormalDirection(
            projectedCoordinates.current,
            extendedPosition,
            offsetSign,
            widthFactor
        );
        gl_Position = extendedPosition + offset;
        v_segmentPosition = 1.0; // 尾部
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
uniform float cameraDistance;
uniform bool is3D;

out vec4 fragColor;

void main() {
    const float zero = 0.0;
    if(speed.a > zero && speed.b > displayRange.x && speed.b < displayRange.y) {
        float speedLength = clamp(speed.b, domain.x, domain.y);
        float normalizedSpeed = (speedLength - domain.x) / (domain.y - domain.x);
        vec4 baseColor = texture(colorTable, vec2(normalizedSpeed, zero));

        // 使用更平滑的渐变效果
        float alpha = smoothstep(0.0, 1.0, v_segmentPosition);
        alpha = pow(alpha, 1.5); // 调整透明度渐变曲线

        // 根据速度调整透明度
        float speedAlpha = mix(0.4, 1.0, speed.a);
        
        // 카메라 거리에 따른 알파 조정 (더 멀리 있을 때 더 선명하게)
        float cameraAlpha = 1.0;
        if (is3D) {
            float distanceNormalized = clamp(cameraDistance / 20000000.0, 0.0, 1.0);
            cameraAlpha = mix(0.6, 1.0, distanceNormalized); // 가까이서는 0.6, 멀리서는 1.0
        }

        // 组合颜色和透明度
        fragColor = vec4(baseColor.rgb, baseColor.a * alpha * speedAlpha * cameraAlpha);
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
