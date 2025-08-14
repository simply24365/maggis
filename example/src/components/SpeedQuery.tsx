import React, { useState, useEffect, useRef } from 'react';
import { Typography, Space, Button } from 'antd';
import styled from 'styled-components';
import { FlowDataAtLonLat, FlowLayer } from 'cesium-wind-layer';
import { Viewer, ScreenSpaceEventHandler, ScreenSpaceEventType, Cartographic, Math as CesiumMath } from 'cesium';
import { GithubOutlined } from '@ant-design/icons';

const { Text } = Typography;

const Container = styled.div`
  background-color: rgba(255, 255, 255, 0.98);
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  backdrop-filter: blur(8px);
  border-radius: 4px;
  margin: 4px;
  padding: 4px 8px;
  z-index: 1000;
  transition: all 0.3s ease;
  min-height: 32px;

  &:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  }

  @media (max-width: 768px) {
    margin: 4px;
    padding: 4px 6px;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
`;

const QueryInfo = styled(Space)`
  flex: 1;
  font-size: 13px;
  
  @media (max-width: 768px) {
    width: 100%;
  }
`;

const DataItem = styled(Text)`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 1px 4px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.02);
  transition: all 0.3s ease;
  font-size: 13px;

  &:hover {
    background: rgba(0, 0, 0, 0.04);
  }
`;

const GithubLink = styled.a`
  display: flex;
  align-items: center;
  gap: 4px;
  color: #24292e;
  text-decoration: none;
  padding: 2px 6px;
  border-radius: 3px;
  transition: all 0.3s ease;
  background: rgba(0, 0, 0, 0.02);
  white-space: nowrap;
  font-size: 13px;

  &:hover {
    background: rgba(0, 0, 0, 0.06);
    transform: translateY(-1px);
  }

  .stats {
    display: flex;
    align-items: center;
    gap: 4px;
    
    img {
      height: 16px;
      transition: transform 0.3s ease;
    }
  }

  &:hover .stats img {
    transform: scale(1.05);
  }

  @media (max-width: 768px) {
    width: 100%;
    justify-content: space-between;
    border-top: 1px solid rgba(0, 0, 0, 0.06);
    padding-top: 4px;
    background: transparent;
  }
`;

const DirectionArrow = styled.span<{ $angle: number }>`
  display: inline-block;
  transform: rotate(${props => props.$angle}deg);
  transition: transform 0.3s ease;
  font-family: "Segoe UI Symbol", "Noto Color Emoji", sans-serif;
`;

const DataContainer = styled(Space)`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  width: 100%;
`;

const DataGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`;

const ToggleButton = styled(Button)`
  font-size: 12px;
  padding: 2px 8px;
  height: 24px;
`;

interface FlowData extends FlowDataAtLonLat {
  direction?: number;
}

interface SpeedQueryProps {
  flowLayer: FlowLayer | null;
  viewer: Viewer | null;
}

export const SpeedQuery: React.FC<SpeedQueryProps> = ({ flowLayer, viewer }) => {
  const [queryResult, setQueryResult] = useState<FlowData | null>(null);
  const [location, setLocation] = useState<{ lon: number; lat: number } | null>(null);
  const [showInterpolated, setShowInterpolated] = useState(true);
  const lastLocationRef = useRef<{ lon: number; lat: number } | null>(null);

  const calculateWindDirection = (u: number, v: number): number => {
    // atan2를 사용하여 각도 계산, 매개변수 순서 주의: atan2(y, x)
    // v는 남북 방향(y축), u는 동서 방향(x축)을 나타냄
    let angle = Math.atan2(v, u) * 180 / Math.PI;
    
    // 지리좌표계 각도로 변환:
    // 1. atan2로 얻은 각도는 수학좌표계(동쪽이 0°, 반시계방향이 양수)
    // 2. 지리방향으로 변환: 반시계방향으로 90도 회전(또는 시계방향으로 270도 회전)
    // 3. 360도를 더하고 모듈로 연산으로 0-360 범위 보장
    angle = (450 - angle) % 360;
    
    return angle;
  };

  const getCardinalDirection = (angle: number): string => {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(angle / 45) % 8;
    return directions[index];
  };

  useEffect(() => {
    if (!flowLayer) return;

    const handleDataChange = () => {
      if (lastLocationRef.current) {
        try {
          const result = flowLayer.getDataAtLonLat(lastLocationRef.current.lon, lastLocationRef.current.lat);
          if (result) {
            const data = showInterpolated ? result.interpolated : result.original;
            const direction = calculateWindDirection(data.u, data.v);
            setQueryResult({ ...result, direction });
          } else {
            setQueryResult(null);
          }
        } catch (error) {
          console.error('Failed to get flow data:', error);
          setQueryResult(null);
        }
      }
    };

    // Add event listener for data changes
    flowLayer.addEventListener('dataChange', handleDataChange);

    return () => {
      // Remove event listener when component unmounts or flowLayer changes
      flowLayer.removeEventListener('dataChange', handleDataChange);
    };
  }, [flowLayer, showInterpolated]);

  useEffect(() => {
    if (!location || !flowLayer) return;
    
    lastLocationRef.current = location;
    
    try {
      const result = flowLayer.getDataAtLonLat(location.lon, location.lat);
      if (result) {
        const data = showInterpolated ? result.interpolated : result.original;
        const direction = calculateWindDirection(data.u, data.v);
        setQueryResult({ ...result, direction });
      } else {
        setQueryResult(null);
      }
    } catch (error) {
      console.error('Failed to get flow data:', error);
      setQueryResult(null);
    }
  }, [flowLayer, location, showInterpolated]);

  useEffect(() => {
    if (!viewer || !flowLayer) return;

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    const handleClick = (movement: any) => {
      const cartesian = viewer.camera.pickEllipsoid(movement.position);
      if (cartesian) {
        const cartographic = Cartographic.fromCartesian(cartesian);
        const lon = CesiumMath.toDegrees(cartographic.longitude);
        const lat = CesiumMath.toDegrees(cartographic.latitude);
        setLocation({ lon, lat });
      }
    };

    handler.setInputAction(handleClick, ScreenSpaceEventType.LEFT_CLICK);
    handler.setInputAction(handleClick, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    return () => {
      handler.destroy();
    };
  }, [viewer, flowLayer]);

  const currentData = queryResult ? (showInterpolated ? queryResult.interpolated : queryResult.original) : null;

  return (
    <Container>
      <QueryInfo>
        {!location && (
          <Text style={{ fontSize: '13px' }}>
            <span style={{ opacity: 0.7 }}>👆</span> Click to query flow info
          </Text>
        )}
        
        {location && (
          <DataContainer>
            <DataGroup>
              <DataItem>
                📍 {location.lon.toFixed(1)}°, {location.lat.toFixed(1)}°
              </DataItem>
              
              {queryResult && currentData && (
                <ToggleButton 
                  type={showInterpolated ? "primary" : "default"}
                  onClick={() => setShowInterpolated(!showInterpolated)}
                >
                  {showInterpolated ? "Interpolated" : "Original"}
                </ToggleButton>
              )}
            </DataGroup>
            
            {!queryResult && (
              <Text type="secondary" style={{ fontSize: '13px' }}>No data</Text>
            )}
            
            {queryResult && currentData && (
              <DataGroup>
                <DataItem title="Flow Speed">
                  💨 Speed: {currentData.speed.toFixed(1)} m/s
                </DataItem>
                
                {currentData.speed > 0 && (
                  <DataItem title="Flow Direction">
                    <DirectionArrow $angle={(queryResult.direction || 0) - 90}>➤</DirectionArrow>
                    {' '}Direction: {queryResult.direction?.toFixed(0)}° ({getCardinalDirection(queryResult.direction || 0)})
                  </DataItem>
                )}
                
                <DataItem title="UV Vector">
                  UV Vector: {currentData.u.toFixed(3)}, {currentData.v.toFixed(3)}
                </DataItem>
              </DataGroup>
            )}
          </DataContainer>
        )}
      </QueryInfo>

      <GithubLink
        href="https://github.com/hongfaqiu/cesium-wind-layer"
        target="_blank"
        rel="noopener noreferrer"
      >
        <GithubOutlined style={{ fontSize: '14px' }} />
        <span>cesium-wind-layer</span>
        <div className="stats">
          <img 
            src="https://img.shields.io/github/stars/hongfaqiu/cesium-wind-layer?style=flat&logo=github"
            alt="GitHub stars" 
          />
        </div>
      </GithubLink>
    </Container>
  );
};
