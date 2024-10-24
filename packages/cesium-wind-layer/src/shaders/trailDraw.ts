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
    // 获取当前点和尾迹的颜色和深度
    vec4 pointsColor = texture(segmentsColorTexture, textureCoordinate);
    vec4 trailsColor = texture(currentTrailsColor, textureCoordinate);
    
    float pointsDepth = texture(segmentsDepthTexture, textureCoordinate).r;
    float trailsDepth = texture(trailsDepthTexture, textureCoordinate).r;
    float globeDepth = czm_unpackDepth(texture(czm_globeDepthTexture, textureCoordinate));
    
    // 计算尾迹颜色的衰减
    vec4 fadeTrailsColor = trailsColor * fadeOpacity;
    
    // 合并点和尾迹的颜色
    fragColor = vec4(0.0);
    if (pointsDepth < globeDepth) {
        // 如果点在地球表面前面，添加点的颜色
        fragColor += pointsColor;
    }
    if (trailsDepth < globeDepth) {
        // 如果尾迹在地球表面前面，添加尾迹的颜色
        fragColor += fadeTrailsColor;
    }
    
    // 设置片段深度为点和尾迹深度的较小值
    gl_FragDepth = min(pointsDepth, trailsDepth);
}
`;
