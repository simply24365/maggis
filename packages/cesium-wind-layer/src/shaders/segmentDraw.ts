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

vec4 calculateOffsetOnNormalDirection(vec4 pointA, vec4 pointB, float offsetSign, float widthFactor, vec2 previousPosition, vec2 currentPosition) {
    vec2 aspectVec2 = vec2(aspect, 1.0);
    vec2 pointA_XY = (pointA.xy / pointA.w) * aspectVec2;
    vec2 pointB_XY = (pointB.xy / pointB.w) * aspectVec2;

    // 계산 방향벡터
    vec2 direction = normalize(pointB_XY - pointA_XY);

    // 카메라 시선 방향을 고려한 법선 벡터 계산
    vec2 normalVector;
    float viewAngleFactor = 1.0;
    
    if (is3D) {
        // 3D 모드에서는 카메라 방향을 고려한 빌보드 효과 적용
        vec3 worldPointA = convertCoordinate(previousPosition);
        vec3 worldPointB = convertCoordinate(currentPosition);
        vec3 particleDirection = normalize(worldPointB - worldPointA);
        
        // 카메라에서 파티클로의 방향
        vec3 viewDirection = normalize(worldPointA - cameraPosition);
        
        // 파티클 방향과 카메라 시선에 수직인 벡터 계산 (빌보드 효과)
        vec3 rightVector = cross(particleDirection, viewDirection);
        float rightLength = length(rightVector);
        
        // cross product가 0에 가까울 때 (정면/후면에서 볼 때) 대체 벡터 사용
        if (rightLength < 0.05) {
            // 카메라의 up 벡터를 사용하여 대체 right 벡터 생성
            rightVector = normalize(cross(particleDirection, cameraUp));
            rightLength = length(rightVector);
            
            // 그래도 문제가 있다면 임의의 벡터 사용
            if (rightLength < 0.001) {
                rightVector = vec3(1.0, 0.0, 0.0);
            }
        } else {
            rightVector = rightVector / rightLength;
        }
        
        // 월드 좌표의 right 벡터를 스크린 좌표로 변환
        vec4 rightWorld4 = vec4(worldPointA + rightVector * 10.0, 1.0);
        vec4 centerWorld4 = vec4(worldPointA, 1.0);
        vec4 rightScreen = czm_modelViewProjection * rightWorld4;
        vec4 centerScreen = czm_modelViewProjection * centerWorld4;
        
        vec2 rightScreenXY = (rightScreen.xy / rightScreen.w) * aspectVec2;
        vec2 centerScreenXY = (centerScreen.xy / centerScreen.w) * aspectVec2;
        normalVector = normalize(rightScreenXY - centerScreenXY);
        normalVector.x = normalVector.x / aspect;
        
        // 파티클이 카메라를 향하는 정도에 따른 두께 조정
        float facingFactor = abs(dot(particleDirection, viewDirection));
        
        // 파티클이 카메라에 평행할 때 (정면/후면에서 볼 때) 더 두껍게
        // 파티클이 카메라에 수직일 때 (측면에서 볼 때) 상대적으로 얇게
        // facingFactor가 1에 가까울 때 = 정면, 0에 가까울 때 = 측면
        viewAngleFactor = mix(0.8, 2.5, facingFactor); // 측면에서 0.8배, 정면에서 2.5배
        
        // 카메라 거리에 따른 추가 스케일 조정
        float distanceFactor = clamp(cameraDistance / 10000000.0, 1.0, 3.0);
        viewAngleFactor *= distanceFactor;
        
        // 최소/최대 두께 제한 (너무 얇아지지 않도록)
        viewAngleFactor = clamp(viewAngleFactor, 0.5, 8.0);
    } else {
        // 2D 모드에서는 기존 방식 사용
        normalVector = vec2(-direction.y, direction.x);
        normalVector.x = normalVector.x / aspect;
        
        // 2D에서도 방향 길이에 따른 조정
        float directionLength = length(pointB_XY - pointA_XY);
        float lengthFactor = clamp(directionLength, 0.01, 1.0);
        viewAngleFactor = mix(2.0, 1.0, lengthFactor);
    }

    // 使用 widthFactor와 viewAngleFactor 조정 너비
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
            widthFactor,
            previousPosition,
            currentPosition
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
            widthFactor,
            previousPosition,
            currentPosition
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

// Visibility control uniforms
uniform float minSpeedAlpha;
uniform float maxSpeedAlpha;
uniform float minCameraAlpha;
uniform float maxCameraAlpha;
uniform float cameraDistanceThreshold;
uniform float edgeFadeWidth;
uniform float minEdgeFade;

out vec4 fragColor;

void main() {
    const float zero = 0.0;
    if(speed.a > zero && speed.b > displayRange.x && speed.b < displayRange.y) {
        float speedLength = clamp(speed.b, domain.x, domain.y);
        float normalizedSpeed = (speedLength - domain.x) / (domain.y - domain.x);
        vec4 baseColor = texture(colorTable, vec2(normalizedSpeed, zero));

        // 더 부드러운 렌더링을 위한 안티앨리어싱
        vec2 coord = textureCoordinate;
        
        // 파티클의 너비 방향으로 부드러운 가장자리 만들기
        // textureCoordinate.t는 파티클의 너비 방향 (0~1)
        float widthFade = 1.0;
        
        // 파티클 가장자리에서 투명도 감소 (사용자 조절 가능)
        if (coord.t < edgeFadeWidth) {
            widthFade = smoothstep(0.0, edgeFadeWidth, coord.t);
        } else if (coord.t > 1.0 - edgeFadeWidth) {
            widthFade = smoothstep(1.0, 1.0 - edgeFadeWidth, coord.t);
        }

        // 길이 방향 투명도 조정 (꼬리 부분)
        float alpha = smoothstep(0.0, 1.0, v_segmentPosition);
        alpha = pow(alpha, 1.2); // 더 부드러운 꼬리 그라디언트

        // 속도에 따른 투명도 (사용자 조절 가능)
        float speedAlpha = mix(minSpeedAlpha, maxSpeedAlpha, normalizedSpeed);
        
        // 카메라 거리에 따른 알파 조정 (사용자 조절 가능)
        float cameraAlpha = 1.0;
        if (is3D) {
            float distanceNormalized = clamp(cameraDistance / cameraDistanceThreshold, 0.0, 1.0);
            cameraAlpha = mix(minCameraAlpha, maxCameraAlpha, distanceNormalized);
        }

        // 가장자리 페이드 조정 (사용자 조절 가능)
        float adjustedWidthFade = mix(minEdgeFade, 1.0, widthFade);

        // 모든 알파 값 조합
        float finalAlpha = baseColor.a * alpha * speedAlpha * cameraAlpha * adjustedWidthFade;
        
        // 부드러운 색상 블렌딩
        vec3 finalColor = baseColor.rgb;
        
        // 파티클이 더 생동감 있게 보이도록 약간의 채도 조정
        finalColor = mix(finalColor, finalColor * 1.1, normalizedSpeed * 0.3);
        
        fragColor = vec4(finalColor, finalAlpha);
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
