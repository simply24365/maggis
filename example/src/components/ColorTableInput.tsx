import React, { useState } from 'react';
import { Select } from 'antd';
import {
  interpolateRainbow,
  interpolateViridis,
  interpolateCool,
  interpolateWarm,
  interpolateInferno,
  interpolateMagma,
  interpolatePlasma,
  interpolateBlues,
  interpolateGreens,
  interpolateOranges,
  interpolateReds,
  interpolatePurples,
} from 'd3-scale-chromatic';
import styled from 'styled-components';

const ColorPreview = styled.div`
  display: flex;
  height: 10px; // Reduced height from 20px to 10px
  width: 100%;
`;

const ColorSegment = styled.div<{ color: string }>`
  flex: 1;
  background-color: ${(props) => props.color};
`;

interface ColorTableInputProps {
  value?: string[];
  onChange?: (value: string[]) => void;
}

const generateColorTable = (
  interpolator: (t: number) => string,
  reverse: boolean = false,
): string[] => {
  const segments = 20;
  const colors = Array.from({ length: segments }).map((_, i) => {
    return interpolator(i / (segments - 1));
  });
  if (reverse) {
    return colors.reverse();
  }
  return colors;
};

export const colorSchemes = [
  { label: 'Rainbow', value: 'rainbow', interpolator: interpolateRainbow, reverse: true },
  { label: 'Viridis', value: 'viridis', interpolator: interpolateViridis },
  { label: 'Cool', value: 'cool', interpolator: interpolateCool },
  { label: 'Warm', value: 'warm', interpolator: interpolateWarm },
  { label: 'Inferno', value: 'inferno', interpolator: interpolateInferno },
  { label: 'Magma', value: 'magma', interpolator: interpolateMagma },
  { label: 'Plasma', value: 'plasma', interpolator: interpolatePlasma },
  { label: 'Blues', value: 'blues', interpolator: interpolateBlues },
  { label: 'Greens', value: 'greens', interpolator: interpolateGreens },
  { label: 'Oranges', value: 'oranges', interpolator: interpolateOranges },
  { label: 'Reds', value: 'reds', interpolator: interpolateReds },
  { label: 'Purples', value: 'purples', interpolator: interpolatePurples },
].map((item) => ({
  ...item,
  colors: generateColorTable(item.interpolator, true),
}));

const ColorTableInput: React.FC<ColorTableInputProps> = ({
  value = [],
  onChange,
}) => {
  const [selectedScheme, setSelectedScheme] = useState(() => {
    // Find matching color scheme
    const matchingScheme = colorSchemes.find(
      (scheme) => JSON.stringify(scheme.colors) === JSON.stringify(value),
    );
    return matchingScheme ? matchingScheme.value : 'rainbow';
  });

  const handleChange = (newValue: string) => {
    setSelectedScheme(newValue);
    const scheme = colorSchemes.find((s) => s.value === newValue);
    if (scheme) {
      onChange?.(scheme.colors);
    }
  };

  const renderColorPreview = (scheme: (typeof colorSchemes)[0]) => {
    const segments = 20;
    return (
      <ColorPreview>
        {Array.from({ length: segments }).map((_, i) => (
          <ColorSegment
            key={i}
            color={scheme.colors[i]}
          />
        ))}
      </ColorPreview>
    );
  };

  return (
    <Select
      style={{ width: '100%' }}
      value={selectedScheme}
      onChange={handleChange}
      labelRender={(selectedValue) => {
        const scheme = colorSchemes.find(
          (s) => s.value === selectedValue.value,
        );
        return scheme ? renderColorPreview(scheme) : null;
      }}
      options={colorSchemes.map((scheme) => ({
        value: scheme.value,
        label: (
          <div>
            <div>{scheme.label}</div>
            {renderColorPreview(scheme)}
          </div>
        ),
      }))}
    />
  );
};

export default ColorTableInput;
