import { FlowFieldDataManager } from "./dataLoad";
import * as Cesium from 'cesium'
import { FlowLayer, type FlowData, type FlowLayerOptions } from './flow'
import GUI from 'lil-gui'

// Helper function to ensure URL path ends with '/'
function ensureTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : url + '/';
}

export class FlowVisualizationManager {
  private viewer: Cesium.Viewer;
  private dataManager?: FlowFieldDataManager;
  private flowLayer?: FlowLayer;
  private gui: GUI;
  private options: FlowLayerOptions;
  private polygonUrl: string;
  private maskUrl: string;
  private csvBaseUrl: string;
  private initialCsvFile: string;
  private maxTime: number;

  constructor(
    viewer: Cesium.Viewer, 
    options: FlowLayerOptions,
    config: {
      polygonUrl: string;
      maskUrl: string;
      csvBaseUrl: string;
      initialCsvFile: string;
      maxTime: number;
    }
  ) {
    this.viewer = viewer;
    this.options = options;
    this.polygonUrl = config.polygonUrl;
    this.maskUrl = config.maskUrl;
    // Ensure csvBaseUrl ends with '/'
    this.csvBaseUrl = ensureTrailingSlash(config.csvBaseUrl);
    this.initialCsvFile = config.initialCsvFile;
    this.maxTime = config.maxTime;
    this.gui = new GUI();
    this.gui.hide(); // Initially hide the GUI
  }

  public async initialize() {
    try {
      await this._initializeDataManager();
      const initialData = await this.dataManager!.generateFromCsv(this.initialCsvFile);
      this._addFlowLayer(initialData);
      this._initializeGUI();
      console.log("FlowVisualizationManager initialized");
      return initialData;
    } catch (e) {
      console.error("Failed to initialize FlowVisualizationManager:", e);
      throw e;
    }
  }

  public setVisible(visible: boolean) {
    if (this.flowLayer) {
      this.flowLayer.show = visible;
    }
  }

  public setGuiVisible(visible: boolean) {
    if (visible) {
      this.gui.show();
    } else {
      this.gui.hide();
    }
  }

  public setCameraView() {
    if (this.flowLayer && this.flowLayer.flowData) {
      const bounds = this.flowLayer.flowData.bounds;
      const rectangle = Cesium.Rectangle.fromDegrees(
        bounds.west,
        bounds.south,
        bounds.east,
        bounds.north
      );
      this.viewer.camera.setView({ destination: rectangle });
    }
  }

  public async updateFlowData(time: number, csvBaseUrl:string | undefined = this.csvBaseUrl) {
    if(csvBaseUrl) {
        this.csvBaseUrl = ensureTrailingSlash(csvBaseUrl);
    }

    if (this.dataManager && this.flowLayer) {
      try {
        const newFlowData = await this.dataManager.generateFromCsv(this._getCsvUrl(time));
        this.flowLayer.updateFlowData(newFlowData);
        console.log(`Updated to time step: ${time}`);
      } catch (error) {
        console.error(`Failed to load time step ${time}:`, error);
        console.log(`데이터 가져오는데 실패했습니다. 시간 단계 ${time}을 로드할 수 없습니다.`);
      }
    } else {
      console.log('데이터 매니저나 플로우 레이어가 초기화되지 않았습니다.');
    }
  }

  // Public helper to set the current time step and update data
  public async setTime(time: number) {
    await this.updateFlowData(time);
  }

  private _getCsvUrl(time: number): string {
    return `${this.csvBaseUrl}${time}.csv`;
  }

  private async _initializeDataManager() {
    this.dataManager = await FlowFieldDataManager.create({
      polygonUrl: this.polygonUrl,
      textureSize: 1024,
      maskUrl: this.maskUrl,
      numSeeds: 128 * 128,
      gridResolution: 64
    });
    console.log("DataManager initialized");
  }

  private _addFlowLayer(flowData: FlowData) {
    this.flowLayer = new FlowLayer(this.viewer, flowData, this.options);
    console.log('FlowLayer added successfully');
  }

  private _initializeGUI() {
    // Time slider
    const timeOptions = { time: 1 };
    this.gui.add(timeOptions, 'time', 1, this.maxTime, 1).onChange(async (time: number) => {
      await this.setTime(time);
    });

    // Flow layer options
    const guiOptions = {
      ...this.options,
      lineWidth_min: this.options.lineWidth?.min || 0.1,
      lineWidth_max: this.options.lineWidth?.max || 0.5,
      lineLength_min: this.options.lineLength?.min || 0.1,
      lineLength_max: this.options.lineLength?.max || 0.1,
    };

    const updateFlowLayerOptions = () => {
      if (this.flowLayer) {
        this.flowLayer.updateOptions({
          ...guiOptions,
          lineWidth: { min: guiOptions.lineWidth_min, max: guiOptions.lineWidth_max },
          lineLength: { min: guiOptions.lineLength_min, max: guiOptions.lineLength_max },
        });
      }
    };

    this.gui.add(guiOptions, 'particlesTextureSize', 100, 1000, 10).onChange(updateFlowLayerOptions);
    this.gui.add(guiOptions, 'dropRate', 0.0, 1, 0.001).onChange(updateFlowLayerOptions);
    this.gui.add(guiOptions, 'particleHeight', 100, 1000, 10).onChange(updateFlowLayerOptions);
    this.gui.add(guiOptions, 'speedFactor', 0.1, 100, 0.01).onChange(updateFlowLayerOptions);
    
    const lineWidthFolder = this.gui.addFolder('Line Width');
    lineWidthFolder.add(guiOptions, 'lineWidth_min', 0.1, 2, 0.1).onChange(updateFlowLayerOptions);
    lineWidthFolder.add(guiOptions, 'lineWidth_max', 0.1, 2, 0.1).onChange(updateFlowLayerOptions);
    
    const lineLengthFolder = this.gui.addFolder('Line Length');
    lineLengthFolder.add(guiOptions, 'lineLength_min', 0.1, 10, 0.1).onChange(updateFlowLayerOptions);
    lineLengthFolder.add(guiOptions, 'lineLength_max', 0.1, 10, 0.1).onChange(updateFlowLayerOptions);
    
    this.gui.add(guiOptions, 'dynamic').onChange(updateFlowLayerOptions);
  }
}
