import './style.css'
import * as Cesium from 'cesium'
import { type FlowLayerOptions } from './flow'
import { FlowVisualizationManager } from './flowVisualizationManager'
import { getQuantile } from './flow/utils';

// --- Cesium Ion Access Token ---
Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI1Yjg3ZmQ3OC00MzMxLTQ5YTctYTYxMi1mOWRmYWI0YjhhMGUiLCJpZCI6MzI2OTU5LCJpYXQiOjE3NTM4NjM2NTR9.KhAkQtUgEh5y_QIC4bxBl65WmZ6vbBYYbpDgGkDf5b4';

// --- Type Definition for Statistics ---
interface VelocityStats {
  count: number;
  min: number;
  max: number;
  median: number;
  q25: number; // 25th percentile
  q75: number; // 75th percentile
  q90: number; // 90th percentile
}

/**
 * Fetches and processes a range of CSV files to calculate velocity statistics.
 * @param csvBaseUrl - The base URL for the CSV files (e.g., "/river-data/20250730").
 * @param startFileIndex - The starting index of the CSV files (e.g., 1).
 * @param endFileIndex - The ending index of the CSV files (e.g., 337).
 */
async function calculateAndLogCsvStats(csvBaseUrl: string, startFileIndex: number, endFileIndex: number): Promise<void> {
  console.log(`Starting statistics calculation for CSV files from ${startFileIndex} to ${endFileIndex}...`);
  
  const allStats: { [key: string]: VelocityStats } = {};

  for (let i = startFileIndex; i <= endFileIndex; i++) {
    const csvUrl = `${csvBaseUrl}/${i}.csv`;
    try {
      const response = await fetch(csvUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${csvUrl}: ${response.statusText}`);
      }
      const csvText = await response.text();
      const lines = csvText.trim().split('\n');
      
      // Skip header line (assuming the first line is the header)
      const dataLines = lines.slice(1);

      const velocities: number[] = [];
      for (const line of dataLines) {
        const parts = line.split(',');
        // Assuming CSV format: longitude, latitude, u, v
        if (parts.length >= 4) {
          const u = parseFloat(parts[2]);
          const v = parseFloat(parts[3]);
          if (!isNaN(u) && !isNaN(v)) {
            const velocityMagnitude = Math.sqrt(u * u + v * v);
            velocities.push(velocityMagnitude);
          }
        }
      }

      if (velocities.length === 0) {
        console.warn(`[Time ${i}] No valid velocity data found in ${csvUrl}`);
        continue;
      }

      // Sort velocities for median and quantile calculations
      velocities.sort((a, b) => a - b);

      const stats: VelocityStats = {
        count: velocities.length,
        min: velocities[0],
        max: velocities[velocities.length - 1],
        median: getQuantile(velocities, 0.5),
        q25: getQuantile(velocities, 0.25),
        q75: getQuantile(velocities, 0.75),
        q90: getQuantile(velocities, 0.90),
      };

      allStats[`time_${i}`] = stats;
      console.log(`[Time ${i}] Stats: Count=${stats.count}, Min=${stats.min.toFixed(4)}, Max=${stats.max.toFixed(4)}, Median=${stats.median.toFixed(4)}`);

    } catch (error) {
      console.error(`Error processing file ${csvUrl}:`, error);
    }
  }

  // Store the complete statistics object in a global variable for debugging
  (window as any).debugObj = allStats;
  console.log(`CSV statistics calculation complete. All data stored in 'window.debugObj'.`);
  console.table(allStats); // For a nice summary view in the browser console
}


// --- Main Execution ---
async function main() {
  // 1. Initialize Cesium Viewer
  const viewer = new Cesium.Viewer('app', {
    terrainProvider: await Cesium.createWorldTerrainAsync()
  });

  // 2. Define Flow Layer Options
  const flowLayerOptions: FlowLayerOptions = {
    particlesTextureSize: 300,
    dropRate: 0.003,
    particleHeight: 120,
    dropRateBump: 0.01,
    speedFactor: 1, 
    lineWidth: { min: 0.1, max: 0.5 },
    lineLength: { min: 0.1, max: 1 },
    colors: ['cyan', 'lime', 'yellow', 'red'],
    flipY: false,
    dynamic: true,
  };

  const configs = {
    polygonUrl: "/river-data/38.rgo",
    maskUrl: "/river-data/mask.png",
    csvBaseUrl: "/river-data/20250730",
    initialCsvFile: "/river-data/20250730/1.csv",
    maxTime: 137
  };

  // 3. Initialize Flow Visualization Manager
  const manager = new FlowVisualizationManager(viewer, flowLayerOptions, configs);

  await manager.initialize();

  // 4. Execute the new statistics and debugging function
  // Reads 1.csv to 337.csv, calculates stats, and logs them.
  // The results are stored in `window.debugObj` for interactive inspection.
  // await calculateAndLogCsvStats(dataUrls.csvBaseUrl, 1, 337);

  // 5. Finalize Scene Setup
  manager.setCameraView();
  manager.setVisible(true);
  manager.setGuiVisible(true);

  // Expose the manager to the global scope for console control
  (window as any).flowManager = manager;
}

// --- Run the Application ---
main().catch(console.error);