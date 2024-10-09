import { Material, Color } from 'cesium';

export function createWindMaterial(colors: string[] = []): Material {
  const WindMaterialType = 'Wind';
  const colorTable = colors.map(color => {
    const cesiumColor = Color.fromCssColorString(color);
    return `vec4(${cesiumColor.red}, ${cesiumColor.green}, ${cesiumColor.blue}, ${cesiumColor.alpha})`;
  }).join(', ');
  const WindMaterialSource = `
    uniform sampler2D windTexture;
    
    vec4 getColorFromTable(float value) {
      const vec4 colorTable[${colors.length}] = vec4[${colors.length}](${colorTable});
      float index = value * float(${colors.length - 1});
      int i = int(floor(index));
      float t = index - float(i);
      return mix(colorTable[i], colorTable[i + 1], t);
    }
    
    czm_material czm_getMaterial(czm_materialInput materialInput)
    {
        czm_material material = czm_getDefaultMaterial(materialInput);
        vec2 uv = materialInput.st;
        vec4 windData = texture(windTexture, uv);
        float speed = length(windData.rg);
        vec4 color = getColorFromTable(speed);
        material.diffuse = color.rgb;
        material.alpha = color.a;
        return material;
    }
  `;

  return new Material({
    fabric: {
      type: WindMaterialType,
      uniforms: {
        windTexture: {
          type: 'sampler2D'
        }
      },
      source: WindMaterialSource,
    },
    translucent: true,
  });
}